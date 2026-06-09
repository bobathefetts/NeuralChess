import { Chess } from 'chess.js';

export const DIFFICULTY_PROFILES = {
  easy: {
    label: 'CASUAL',
    temperature: 0.95,
    topP: 1,
    maxOutputTokens: 160,
    retries: 2,
    style:
      'Play like a casual player. Favor simple development and intuitive moves over deep calculation.',
    checklist: [
      'You may give a short reaction to the position.',
      'Do not deeply analyze every line.',
      'The final line must still be exactly one legal UCI move.',
    ],
  },
  normal: {
    label: 'CAREFUL',
    temperature: 0.45,
    topP: 0.9,
    maxOutputTokens: 200,
    retries: 3,
    style:
      'Play like a careful intermediate player. Balance development, king safety, captures, and threats.',
    checklist: [
      'Briefly consider checks, captures, and hanging pieces.',
      'Keep the response concise.',
      'The final line must still be exactly one legal UCI move.',
    ],
  },
  hard: {
    label: 'SHARP',
    temperature: 0.2,
    topP: 0.75,
    maxOutputTokens: 240,
    retries: 4,
    style:
      'Play the best move you can find. Prioritize forced tactics, checks, captures, threats, and king safety.',
    checklist: [
      'Check for mates, checks, captures, and tactical threats before choosing.',
      'If multiple moves look similar, prefer the most forcing move.',
      'The final line must still be exactly one legal UCI move.',
    ],
  },
};

export function getDifficultyProfile(difficulty = 'normal') {
  return DIFFICULTY_PROFILES[difficulty] || DIFFICULTY_PROFILES.normal;
}

export function createProviderConfig(config = {}) {
  const apiType = config.apiType || 'ollama';
  return {
    preset: config.preset || apiType,
    apiType,
    baseUrl:
      config.baseUrl ||
      (apiType === 'ollama'
        ? 'http://localhost:11434'
        : apiType === 'openai'
          ? 'https://api.openai.com/v1'
          : 'https://api.anthropic.com/v1'),
    model: (config.model || '').trim(),
    apiKey: config.apiKey || '',
    hasStoredApiKey: Boolean(config.hasStoredApiKey),
  };
}

export function createRuntimeRequest({
  config,
  fen,
  moveHistory = [],
  game,
  difficulty = 'normal',
  errorFeedback = '',
}) {
  const profile = getDifficultyProfile(difficulty);
  const verboseMoves = game.moves({ verbose: true });
  const legalMoves = verboseMoves.map(toUciMove);
  const turnColor = game.turn() === 'w' ? 'White' : 'Black';
  const recentMoves = moveHistory.slice(-12).map((move) => move.san).join(', ') || 'none';
  const boardAscii = game.ascii();
  const moveList = legalMoves.join(', ');
  const correction =
    errorFeedback && errorFeedback.trim()
      ? `Previous response issue: ${errorFeedback.trim()}`
      : null;

  const systemPrompt = [
    `You are an LLM playing chess against a human at the ${profile.label} difficulty profile.`,
    profile.style,
    'You may include a short analysis, but your final line must be exactly one legal move in UCI format.',
    'Never invent a move, never use SAN on the final line, and never choose a move outside the legal list.',
  ].join('\n');

  const userPrompt = [
    `${turnColor} to move.`,
    `FEN: ${fen}`,
    `Recent moves: ${recentMoves}`,
    'Board:',
    boardAscii,
    `Legal moves: ${moveList}`,
    'Difficulty instructions:',
    ...profile.checklist.map((item) => `- ${item}`),
    correction,
    'Final line: one legal UCI move from the list above.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    game,
    profile,
    legalMoves,
    systemPrompt,
    userPrompt,
    config: createProviderConfig(config),
  };
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

export async function requestLLMMove({
  config,
  fen,
  moveHistory = [],
  game,
  difficulty = 'normal',
  onToken,
  signal,
  errorFeedback = '',
  fetchImpl = fetch,
  logger = null,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}) {
  const request = createRuntimeRequest({
    config,
    fen,
    moveHistory,
    game,
    difficulty,
    errorFeedback,
  });

  // A provider that accepts the connection but never streams would hang the
  // UI forever; cap the whole request while still honoring the caller abort.
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  const params = {
    ...request,
    onToken,
    signal: combinedSignal,
    fetchImpl,
    logger,
  };

  try {
    switch (request.config.apiType) {
      case 'ollama':
        return await callOllama(params);
      case 'anthropic':
        return await callAnthropic(params);
      case 'openai':
      default:
        return await callOpenAI(params);
    }
  } catch (error) {
    if (error.name === 'AbortError' && timeoutController.signal.aborted && !signal?.aborted) {
      throw new Error(
        `Provider did not respond within ${Math.round(timeoutMs / 1000)}s.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function listOllamaModels(baseUrl = 'http://localhost:11434', fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/tags`);
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return (data.models || []).map((model) => model.name).filter(Boolean);
  } catch {
    return [];
  }
}

async function callOllama(params) {
  const url = `${params.config.baseUrl.replace(/\/$/, '')}/api/chat`;
  let streamedText = '';
  const handleToken = (token, fullText) => {
    streamedText = fullText;
    params.onToken?.(token, fullText);
  };
  const body = {
    model: params.config.model,
    messages: [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: params.userPrompt },
    ],
    stream: true,
    options: {
      temperature: params.profile.temperature,
      top_p: params.profile.topP,
    },
  };

  const response = await params.fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: params.signal,
  });
  if (!response.ok) {
    throw new Error(`Ollama error ${response.status}${await readErrorBody(response)}`);
  }

  const fullText = await readNdjsonStream(
    response,
    (item) => item.message?.content || item.message?.thinking || '',
    handleToken,
    params.signal
  );

  return finalizeMove(
    streamedText.length > fullText.length ? streamedText : fullText,
    params.game,
    params.legalMoves,
    params.logger,
    'ollama'
  );
}

async function callOpenAI(params) {
  const url = `${params.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  let streamedText = '';
  const handleToken = (token, fullText) => {
    streamedText = fullText;
    params.onToken?.(token, fullText);
  };
  const headers = { 'Content-Type': 'application/json' };
  if (params.config.apiKey) {
    headers.Authorization = `Bearer ${params.config.apiKey}`;
  }

  const body = {
    messages: [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: params.userPrompt },
    ],
    stream: true,
    temperature: params.profile.temperature,
    max_completion_tokens: params.profile.maxOutputTokens,
  };
  if (params.config.model) {
    body.model = params.config.model;
  }

  const response = await params.fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: params.signal,
  });
  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}${await readErrorBody(response)}`);
  }

  const fullText = await readSseStream(
    response,
    (payload) =>
      payload.choices?.[0]?.delta?.content ||
      payload.choices?.[0]?.delta?.reasoning ||
      payload.choices?.[0]?.delta?.reasoning_content ||
      '',
    handleToken,
    params.signal
  );

  return finalizeMove(
    streamedText.length > fullText.length ? streamedText : fullText,
    params.game,
    params.legalMoves,
    params.logger,
    'openai'
  );
}

async function callAnthropic(params) {
  const url = `${params.config.baseUrl.replace(/\/$/, '')}/messages`;
  let streamedText = '';
  const handleToken = (token, fullText) => {
    streamedText = fullText;
    params.onToken?.(token, fullText);
  };
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': params.config.apiKey || '',
    'anthropic-version': '2023-06-01',
  };

  const body = {
    max_tokens: params.profile.maxOutputTokens,
    stream: true,
    system: params.systemPrompt,
    messages: [{ role: 'user', content: params.userPrompt }],
    temperature: params.profile.temperature,
  };
  if (params.config.model) {
    body.model = params.config.model;
  }

  const response = await params.fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: params.signal,
  });
  if (!response.ok) {
    throw new Error(`Anthropic error ${response.status}${await readErrorBody(response)}`);
  }

  const fullText = await readSseStream(
    response,
    (payload) => {
      if (payload.type === 'content_block_delta') {
        return payload.delta?.text || '';
      }
      if (payload.type === 'message_delta') {
        return payload.delta?.text || '';
      }
      return '';
    },
    handleToken,
    params.signal
  );

  return finalizeMove(
    streamedText.length > fullText.length ? streamedText : fullText,
    params.game,
    params.legalMoves,
    params.logger,
    'anthropic'
  );
}

async function readErrorBody(response) {
  try {
    const text = (await response.text()).trim();
    return text ? `: ${text.slice(0, 300)}` : '';
  } catch {
    return '';
  }
}

async function readNdjsonStream(response, extractContent, onToken, signal) {
  if (!response.body) {
    throw new Error('Provider returned no response body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  const onAbort = () => {
    reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const token = parseStreamToken(line.trim(), extractContent);
        if (token) {
          fullText += token;
          onToken?.(token, fullText);
        }
      }
    }

    const token = parseStreamToken(buffer.trim(), extractContent);
    if (token) {
      fullText += token;
      onToken?.(token, fullText);
    }

    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }

  return fullText;
}

async function readSseStream(response, extractContent, onToken, signal) {
  if (!response.body) {
    throw new Error('Provider returned no response body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  const onAbort = () => {
    reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const payloadText = extractSsePayload(chunk);
        if (payloadText === '[DONE]') {
          continue;
        }
        const token = parseStreamToken(payloadText, extractContent);
        if (token) {
          fullText += token;
          onToken?.(token, fullText);
        }
      }
    }

    const finalPayload = extractSsePayload(buffer);
    if (finalPayload !== '[DONE]') {
      const token = parseStreamToken(finalPayload, extractContent);
      if (token) {
        fullText += token;
        onToken?.(token, fullText);
      }
    }

    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }

  return fullText;
}

// One malformed line from a provider must not kill the whole request.
function parseStreamToken(payloadText, extractContent) {
  if (!payloadText) {
    return '';
  }
  try {
    return extractContent(JSON.parse(payloadText)) || '';
  } catch {
    return '';
  }
}

function extractSsePayload(chunk) {
  return chunk
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');
}

function finalizeMove(text, game, legalMoves, logger, provider) {
  const move = parseMoveFromText(text, game);
  if (move) {
    return move;
  }

  logger?.warn?.('llm.move_parse_failed', {
    provider,
    preview: text.slice(0, 400),
    legalMoves,
  });
  throw new Error(`AI response had no valid move. Legal moves were: ${legalMoves.join(', ')}`);
}

export function parseMoveFromText(text, game) {
  if (!text || !game) {
    return null;
  }

  const legalMoves = new Map(
    game.moves({ verbose: true }).map((move) => [toUciMove(move), move])
  );
  const clean = text
    .replace(/<think>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<think>[\s\S]*/gi, ' ')
    .replace(/```[\s\S]*?```/g, (block) => ` ${block.replace(/`/g, ' ')} `)
    .replace(/[*_`>#()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = normalizeUciToken(lines[index]);
    if (candidate && legalMoves.has(candidate)) {
      return candidate;
    }
  }

  const uciMatches = Array.from(
    clean.matchAll(/\b([a-h][1-8])\s*[-x]?\s*([a-h][1-8])\s*([qrbn])?\b/gi)
  );
  for (let index = uciMatches.length - 1; index >= 0; index -= 1) {
    const match = uciMatches[index];
    const candidate = `${match[1]}${match[2]}${match[3] || ''}`.toLowerCase();
    if (legalMoves.has(candidate)) {
      return candidate;
    }
  }

  const tokens = clean
    .split(/[^a-zA-Z0-9=+#-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    const normalized = normalizeUciToken(token);
    if (normalized && legalMoves.has(normalized)) {
      return normalized;
    }

    try {
      const temp = new Chess(game.fen());
      const result = temp.move(token);
      if (result) {
        return toUciMove(result);
      }
    } catch {
      continue;
    }
  }

  return null;
}

function normalizeUciToken(token) {
  const compact = token.replace(/[^a-h1-8qrbn]/gi, '').toLowerCase();
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(compact)) {
    return compact;
  }
  return null;
}

function toUciMove(move) {
  return `${move.from}${move.to}${move.promotion || ''}`;
}

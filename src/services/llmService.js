import { Chess } from 'chess.js';
import {
  getDifficultyProfile,
  listOllamaModels as listOllamaModelsDirect,
  requestLLMMove as requestDirectMove,
} from './llmCore';
import { hasDesktopRuntime } from './runtimeBridge';

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() || `move-${Date.now()}-${Math.random()}`;
}

export async function getLLMMove(
  config,
  fen,
  moveHistory,
  game,
  difficulty = 'normal',
  onToken,
  signal,
  errorFeedback = ''
) {
  if (hasDesktopRuntime()) {
    return requestDesktopMove({
      config,
      fen,
      moveHistory,
      difficulty,
      errorFeedback,
      onToken,
      signal,
    });
  }

  return requestDirectMove({
    config,
    fen,
    moveHistory,
    game,
    difficulty,
    errorFeedback,
    onToken,
    signal,
  });
}

export function getMaxRetries(difficulty = 'normal') {
  return getDifficultyProfile(difficulty).retries;
}

export async function listOllamaModels(baseUrl = 'http://localhost:11434') {
  return listOllamaModelsDirect(baseUrl);
}

async function requestDesktopMove({
  config,
  fen,
  moveHistory,
  difficulty,
  errorFeedback,
  onToken,
  signal,
}) {
  const requestId = createRequestId();
  const desktop = window.neuralChessDesktop;
  const unsubscribe = desktop.onMoveStream((payload) => {
    if (payload.requestId === requestId) {
      onToken?.(payload.chunk, payload.fullText);
    }
  });
  const abortHandler = () => {
    desktop.abortMove(requestId);
  };
  signal?.addEventListener('abort', abortHandler, { once: true });

  try {
    return await desktop.requestMove({
      requestId,
      config,
      fen,
      moveHistory,
      difficulty,
      errorFeedback,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error;
    }
    throw new Error(error?.message || 'AI request failed.');
  } finally {
    unsubscribe();
    signal?.removeEventListener('abort', abortHandler);
  }
}

export function buildFallbackMove(game) {
  const fallbackMoves = game.moves({ verbose: true });
  if (!fallbackMoves.length) {
    return null;
  }
  const pick = fallbackMoves[Math.floor(Math.random() * fallbackMoves.length)];
  return `${pick.from}${pick.to}${pick.promotion || ''}`;
}

export function ensureGameInstance(fen) {
  return new Chess(fen);
}

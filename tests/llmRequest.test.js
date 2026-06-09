import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { requestLLMMove } from '../src/services/llmCore.js';

const OLLAMA_CONFIG = {
  preset: 'ollama',
  apiType: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'test-model',
};

function streamResponse(chunks) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
  };
}

test('malformed stream lines are skipped instead of failing the request', async () => {
  const game = new Chess();
  const move = await requestLLMMove({
    config: OLLAMA_CONFIG,
    fen: game.fen(),
    game,
    fetchImpl: async () =>
      streamResponse([
        '{"message":{"content":"My move: "}}\n',
        'this-is-not-json\n',
        '{"broken json\n',
        '{"message":{"content":"e2e4"}}\n',
      ]),
  });
  assert.equal(move, 'e2e4');
});

test('provider error responses include the response body', async () => {
  const game = new Chess();
  await assert.rejects(
    requestLLMMove({
      config: { ...OLLAMA_CONFIG, apiType: 'openai', baseUrl: 'https://api.example.com/v1' },
      fen: game.fen(),
      game,
      fetchImpl: async () => ({
        ok: false,
        status: 400,
        text: async () => '{"error":{"message":"you must provide a model parameter"}}',
      }),
    }),
    /OpenAI error 400.*you must provide a model parameter/s
  );
});

test('a provider that never streams is timed out', async () => {
  const game = new Chess();
  await assert.rejects(
    requestLLMMove({
      config: OLLAMA_CONFIG,
      fen: game.fen(),
      game,
      timeoutMs: 100,
      fetchImpl: async () => ({
        ok: true,
        body: new ReadableStream({ start() {} }),
      }),
    }),
    /did not respond within/
  );
});

test('caller aborts surface as AbortError, not as timeout', async () => {
  const game = new Chess();
  const controller = new AbortController();
  const pending = requestLLMMove({
    config: OLLAMA_CONFIG,
    fen: game.fen(),
    game,
    signal: controller.signal,
    fetchImpl: async () => ({
      ok: true,
      body: new ReadableStream({ start() {} }),
    }),
  });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending, (error) => error.name === 'AbortError');
});

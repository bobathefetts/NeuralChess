import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  DIFFICULTY_PROFILES,
  createRuntimeRequest,
  parseMoveFromText,
} from '../src/services/llmCore.js';

test('parseMoveFromText extracts the last legal UCI move from noisy output', () => {
  const game = new Chess();
  const move = parseMoveFromText(
    'I considered d2d4 first, but the final move is:\n\ne2e4',
    game
  );
  assert.equal(move, 'e2e4');
});

test('parseMoveFromText accepts SAN when it is legal in the current position', () => {
  const game = new Chess();
  const move = parseMoveFromText('I will play Nf3.', game);
  assert.equal(move, 'g1f3');
});

test('parseMoveFromText rejects illegal moves even if they look like UCI', () => {
  const game = new Chess();
  const move = parseMoveFromText('My move is e7e5.', game);
  assert.equal(move, null);
});

test('difficulty profiles have distinct temperatures and retry budgets', () => {
  assert.equal(DIFFICULTY_PROFILES.easy.temperature > DIFFICULTY_PROFILES.normal.temperature, true);
  assert.equal(DIFFICULTY_PROFILES.hard.temperature < DIFFICULTY_PROFILES.normal.temperature, true);
  assert.equal(DIFFICULTY_PROFILES.easy.retries < DIFFICULTY_PROFILES.hard.retries, true);
});

test('createRuntimeRequest includes legal moves and difficulty instructions', () => {
  const game = new Chess();
  const request = createRuntimeRequest({
    config: { apiType: 'ollama', baseUrl: 'http://localhost:11434', model: 'gemma3:4b' },
    fen: game.fen(),
    moveHistory: [],
    game,
    difficulty: 'hard',
  });

  assert.match(request.systemPrompt, /SHARP/);
  assert.match(request.userPrompt, /Legal moves:/);
  assert.equal(request.legalMoves.includes('e2e4'), true);
});

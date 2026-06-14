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

test('parseMoveFromText finds the move at the end of multi-line reasoning', () => {
  const game = new Chess();
  const move = parseMoveFromText(
    'Let me analyze.\nThe center is important.\nI will develop a piece.\nFinal answer: Nf3',
    game
  );
  assert.equal(move, 'g1f3');
});

test('parseMoveFromText extracts a move wrapped in markdown emphasis', () => {
  const game = new Chess();
  assert.equal(parseMoveFromText('The best move is **e4**.', game), 'e2e4');
});

test('parseMoveFromText extracts a move from a code fence', () => {
  const game = new Chess();
  assert.equal(parseMoveFromText('```\ng1f3\n```', game), 'g1f3');
});

test('parseMoveFromText handles promotion in both UCI and SAN form', () => {
  const fen = '8/P7/8/8/8/4k3/8/4K3 w - - 0 1';
  assert.equal(parseMoveFromText('a7a8q', new Chess(fen)), 'a7a8q');
  assert.equal(parseMoveFromText('I will promote: a8=Q', new Chess(fen)), 'a7a8q');
});

test('parseMoveFromText resolves disambiguated SAN and rejects ambiguous SAN', () => {
  // Two knights (b1 and f3) can both reach d2.
  const fen = '4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1';
  assert.equal(parseMoveFromText('Nbd2', new Chess(fen)), 'b1d2');
  // Ambiguous "Nd2" can't be resolved, so it must be rejected (triggers retry).
  assert.equal(parseMoveFromText('Nd2', new Chess(fen)), null);
});

test('parseMoveFromText rejects a move that is only legal for the other side', () => {
  // White to move; "Nf6" is a black developing move and illegal here.
  const game = new Chess();
  assert.equal(parseMoveFromText('Nf6', game), null);
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

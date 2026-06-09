import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { getGameStatus } from '../src/services/gameStatus.js';

test('stalemate is reported as stalemate, not generic draw', () => {
  const game = new Chess('k7/8/1Q6/8/8/8/8/7K b - - 0 1');
  assert.equal(game.isStalemate(), true, 'precondition: position is stalemate');
  assert.equal(game.isDraw(), true, 'precondition: chess.js counts stalemate as a draw');
  assert.equal(getGameStatus(game), 'stalemate');
});

test('insufficient material is reported with its reason', () => {
  const game = new Chess('k7/8/2K5/8/8/8/8/5B2 w - - 0 1');
  assert.equal(game.isInsufficientMaterial(), true, 'precondition');
  assert.equal(getGameStatus(game), 'insufficient-material');
});

test('checkmate wins over other statuses', () => {
  const game = new Chess('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1');
  assert.equal(game.isCheckmate(), true, 'precondition');
  assert.equal(getGameStatus(game), 'checkmate');
});

test('check and normal play are distinguished', () => {
  const inCheck = new Chess('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1');
  assert.equal(getGameStatus(inCheck), 'check');
  assert.equal(getGameStatus(new Chess()), 'playing');
});

test('threefold repetition is reported with its reason', () => {
  const game = new Chess();
  // Shuffle knights back and forth until the start position repeats 3 times
  const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
  for (let round = 0; round < 2; round += 1) {
    for (const move of cycle) {
      game.move(move);
    }
  }
  assert.equal(game.isThreefoldRepetition(), true, 'precondition');
  assert.equal(getGameStatus(game), 'repetition');
});

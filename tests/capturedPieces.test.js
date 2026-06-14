import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { getCapturedPieces } from '../src/services/capturedPieces.js';

function play(sans) {
  const game = new Chess();
  return sans.map((san) => game.move(san));
}

test('no captures yields empty lists and zero advantage', () => {
  const captured = getCapturedPieces(play(['e4', 'e5', 'Nf3']));
  assert.deepEqual(captured.w, []);
  assert.deepEqual(captured.b, []);
  assert.equal(captured.advantage, 0);
});

test('tracks which side captured which piece', () => {
  // 1. e4 d5 2. exd5 -> White captures a black pawn
  const captured = getCapturedPieces(play(['e4', 'd5', 'exd5']));
  assert.deepEqual(captured.w, ['p']);
  assert.deepEqual(captured.b, []);
  assert.equal(captured.advantage, 1);
});

test('material advantage is symmetric and sorted by value', () => {
  // White wins a queen, Black wins a rook -> White +4
  const captured = getCapturedPieces([
    { color: 'w', captured: 'p' },
    { color: 'w', captured: 'q' },
    { color: 'b', captured: 'r' },
  ]);
  assert.deepEqual(captured.w, ['q', 'p']); // sorted high-to-low
  assert.deepEqual(captured.b, ['r']);
  assert.equal(captured.advantage, 10 - 5);
});

test('counts en passant captures', () => {
  // 1. e4 a6 2. e5 d5 3. exd6 (en passant) -> White captures a pawn
  const captured = getCapturedPieces(play(['e4', 'a6', 'e5', 'd5', 'exd6']));
  assert.deepEqual(captured.w, ['p']);
  assert.equal(captured.advantage, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { buildPgn, undoableMoveCount } from '../src/services/gameRecord.js';

function playMoves(sans) {
  const game = new Chess();
  return sans.map((san) => game.move(san));
}

test('buildPgn reconstructs the full game with headers', () => {
  const history = playMoves(['e4', 'e5', 'Nf3', 'Nc6']);
  const pgn = buildPgn(history, { white: 'Human', black: 'gemma3:4b' });
  assert.match(pgn, /\[White "Human"\]/);
  assert.match(pgn, /\[Black "gemma3:4b"\]/);
  assert.match(pgn, /1\. e4 e5 2\. Nf3 Nc6/);
});

test('buildPgn records a custom starting position', () => {
  const fen = '8/P7/8/8/8/4k3/8/4K3 w - - 0 1';
  const game = new Chess(fen);
  const history = [game.move('a8=Q')];
  const pgn = buildPgn(history, { initialFen: fen });
  assert.match(pgn, /a8=Q/);
  assert.match(pgn, /\[FEN "8\/P7/);
});

test('undoableMoveCount removes a full turn when the AI replied', () => {
  const history = playMoves(['e4', 'e5']);
  // Player is white, AI (black) replied: undo both plies
  assert.equal(undoableMoveCount(history, 'w'), 2);
});

test('undoableMoveCount removes one ply when the player moved last', () => {
  const history = playMoves(['e4']);
  assert.equal(undoableMoveCount(history, 'w'), 1);
});

test('undoableMoveCount handles the black player with one AI move on the board', () => {
  const history = playMoves(['e4']);
  // Player is black, only the AI's move exists: undo just that move
  assert.equal(undoableMoveCount(history, 'b'), 1);
});

test('undoableMoveCount is zero with no history', () => {
  assert.equal(undoableMoveCount([], 'w'), 0);
});

import { Chess } from 'chess.js';

// Rebuilds the game from the recorded SAN history so the PGN contains the
// whole game (each move is played on a fresh Chess instance in the UI, so
// no single instance holds full history).
export function buildPgn(moveHistory, { initialFen = null, white = 'Player', black = 'AI', event = 'Neural Chess Match' } = {}) {
  const game = initialFen ? new Chess(initialFen) : new Chess();
  setHeader(game, 'Event', event);
  setHeader(game, 'Date', formatPgnDate(new Date()));
  setHeader(game, 'White', white);
  setHeader(game, 'Black', black);
  for (const move of moveHistory) {
    game.move(move.san);
  }
  return game.pgn();
}

// How many plies to remove so the player is back on move with their last
// move undone: one if the player moved last (AI has not replied), else two.
export function undoableMoveCount(moveHistory, playerColor) {
  if (!moveHistory.length) {
    return 0;
  }
  if (moveHistory[moveHistory.length - 1].color === playerColor) {
    return 1;
  }
  return Math.min(2, moveHistory.length);
}

function setHeader(game, key, value) {
  if (typeof game.setHeader === 'function') {
    game.setHeader(key, value);
  } else {
    game.header(key, value);
  }
}

function formatPgnDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}.${month}.${day}`;
}

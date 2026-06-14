const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };

function totalValue(pieces) {
  return pieces.reduce((sum, type) => sum + (PIECE_VALUES[type] || 0), 0);
}

// Derives captured pieces from the move history. A verbose chess.js move has a
// `captured` piece type and the `color` of the side that made the move, so a
// white move with a capture removed a black piece (and vice versa).
//
// Returns { w, b, advantage } where:
//   w = piece types White captured (i.e. Black's lost pieces)
//   b = piece types Black captured (i.e. White's lost pieces)
//   advantage = White's material lead (positive: White ahead, negative: Black)
export function getCapturedPieces(moveHistory = []) {
  const w = [];
  const b = [];
  for (const move of moveHistory) {
    if (!move || !move.captured) {
      continue;
    }
    if (move.color === 'w') {
      w.push(move.captured);
    } else {
      b.push(move.captured);
    }
  }
  const byValueDesc = (a, c) => (PIECE_VALUES[c] || 0) - (PIECE_VALUES[a] || 0);
  w.sort(byValueDesc);
  b.sort(byValueDesc);
  return { w, b, advantage: totalValue(w) - totalValue(b) };
}

// Pure game-status derivation from a chess.js instance.
// Order matters: chess.js isDraw() includes stalemate, so the specific
// conditions must be checked before the generic draw fallback.
export function getGameStatus(game) {
  if (game.isCheckmate()) return 'checkmate';
  if (game.isStalemate()) return 'stalemate';
  if (game.isThreefoldRepetition()) return 'repetition';
  if (game.isInsufficientMaterial()) return 'insufficient-material';
  if (game.isDrawByFiftyMoves()) return 'fifty-move';
  if (game.isDraw()) return 'draw';
  if (game.isCheck()) return 'check';
  return 'playing';
}

import { useState, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';

export function useChessGame() {
  // 1. Single source of truth: The game instance
  const [game, setGame] = useState(() => new Chess());
  
  // 2. UI-specific state
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]);

  // 3. Derived State: These calculate automatically whenever 'game' changes
  const fen = useMemo(() => game.fen(), [game]);
  
  const gameStatus = useMemo(() => {
    if (game.isCheckmate()) return 'checkmate';
    if (game.isDraw()) return 'draw';
    if (game.isStalemate()) return 'stalemate';
    if (game.isCheck()) return 'check';
    return 'playing';
  }, [game]);

  const legalMoves = useMemo(() => {
    if (!selectedSquare) return [];
    return game.moves({ square: selectedSquare, verbose: true });
  }, [game, selectedSquare]);

  // 4. Actions
  const makeMove = useCallback((from, to, promotion = 'q') => {
    const gameCopy = new Chess(game.fen());
    try {
      const result = gameCopy.move({ from, to, promotion });
      if (result) {
        setGame(gameCopy);
        setLastMove({ from, to });
        setMoveHistory(prev => [...prev, result]); // Persist history separately
        setSelectedSquare(null);
        return result;
      }
    } catch {
      return null;
    }
    return null;
  }, [game]);

  const selectSquare = useCallback((square) => {
    const piece = game.get(square);
    const isFriendly = piece && piece.color === game.turn();

    if (selectedSquare) {
      const move = legalMoves.find(m => m.to === square);
      if (move) {
        return makeMove(selectedSquare, square);
      }
      
      if (isFriendly) {
        setSelectedSquare(square);
      } else {
        setSelectedSquare(null);
      }
    } else {
      if (isFriendly) {
        setSelectedSquare(square);
      }
    }
  }, [game, selectedSquare, legalMoves, makeMove]);

  const resetGame = useCallback(() => {
    setGame(new Chess());
    setLastMove(null);
    setSelectedSquare(null);
    setMoveHistory([]); // Clear history on reset
  }, []);

  const getTurn = useCallback(() => game.turn(), [game]);
  const isGameOver = useCallback(() => game.isGameOver(), [game]);

  return {
    game,
    fen,
    selectedSquare,
    legalMoves,
    moveHistory,
    gameStatus,
    lastMove,
    selectSquare,
    makeMove,
    resetGame,
    getTurn,
    isGameOver,
  };
}

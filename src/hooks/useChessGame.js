import { useState, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import { getGameStatus } from '../services/gameStatus';

// Optional ?fen=... query parameter sets the starting position. Useful for
// testing specific positions (promotions, endgames) against a model.
function getInitialFen() {
  try {
    const fen = new URLSearchParams(window.location.search).get('fen');
    if (fen) {
      new Chess(fen); // throws on invalid FEN
      return fen;
    }
  } catch {
    return null;
  }
  return null;
}

const initialFen = getInitialFen();

function createGame() {
  return initialFen ? new Chess(initialFen) : new Chess();
}

export function useChessGame() {
  // 1. Single source of truth: The game instance
  const [game, setGame] = useState(createGame);

  // 2. UI-specific state
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]);
  const [pendingPromotion, setPendingPromotion] = useState(null);

  // 3. Derived State: These calculate automatically whenever 'game' changes
  const fen = useMemo(() => game.fen(), [game]);

  const gameStatus = useMemo(() => getGameStatus(game), [game]);

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
        if (move.promotion) {
          // Defer the move until the player picks a promotion piece
          setPendingPromotion({ from: selectedSquare, to: square });
          setSelectedSquare(null);
          return null;
        }
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

  const promote = useCallback((piece) => {
    if (!pendingPromotion) return null;
    const result = makeMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
    return result;
  }, [makeMove, pendingPromotion]);

  const cancelPromotion = useCallback(() => {
    setPendingPromotion(null);
  }, []);

  const resetGame = useCallback(() => {
    setGame(createGame());
    setLastMove(null);
    setSelectedSquare(null);
    setMoveHistory([]); // Clear history on reset
    setPendingPromotion(null);
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
    pendingPromotion,
    selectSquare,
    makeMove,
    promote,
    cancelPromotion,
    resetGame,
    getTurn,
    isGameOver,
  };
}

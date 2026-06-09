import { useMemo } from 'react';
import { Chess } from 'chess.js';
import './ChessBoard.css';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const PIECE_SYMBOLS = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

function parseFen(fen) {
  const chess = new Chess(fen);
  const board = {};
  for (const file of FILES) {
    for (const rank of RANKS) {
      const sq = file + rank;
      const piece = chess.get(sq);
      if (piece) board[sq] = piece;
    }
  }
  return board;
}

export default function ChessBoard({
  fen,
  selectedSquare,
  legalMoves,
  lastMove,
  onSquareClick,
  playerColor = 'w',
  disabled = false,
  squareSize = 72,
}) {
  const board = useMemo(() => parseFen(fen), [fen]);
  const legalTargets = useMemo(() => new Set(legalMoves.map(m => m.to)), [legalMoves]);

  const ranks = playerColor === 'w' ? RANKS : [...RANKS].reverse();
  const files = playerColor === 'w' ? FILES : [...FILES].reverse();

  return (
    <div className="board-wrapper" style={{ '--sq': `${squareSize}px` }}>
      <div className="board-glow" />
      <div className="board-container">
        <div className="rank-labels">
          {ranks.map(r => <span key={r}>{r}</span>)}
        </div>

        <div>
          <div className="file-labels">
            {files.map(f => <span key={f}>{f}</span>)}
          </div>

          <div className="board">
            {ranks.map((rank) =>
              files.map((file) => {
                const square = file + rank;
                const piece = board[square];
                const isLight = (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0;
                const isSelected = selectedSquare === square;
                const isLegalTarget = legalTargets.has(square);
                const isLastMoveFrom = lastMove?.from === square;
                const isLastMoveTo = lastMove?.to === square;

                return (
                  <div
                    key={square}
                    className={[
                      'square',
                      isLight ? 'light' : 'dark',
                      isSelected ? 'selected' : '',
                      isLastMoveFrom || isLastMoveTo ? 'last-move' : '',
                      disabled ? 'disabled' : '',
                    ].join(' ')}
                    onClick={() => !disabled && onSquareClick(square)}
                  >
                    {isLegalTarget && (
                      <div className={`move-hint ${piece ? 'capture-hint' : 'dot-hint'}`} />
                    )}
                    {piece && (
                      <span
                        className={`piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`}
                      >
                        {PIECE_SYMBOLS[piece.color + piece.type.toUpperCase()]}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="file-labels">
            {files.map(f => <span key={f}>{f}</span>)}
          </div>
        </div>

        <div className="rank-labels">
          {ranks.map(r => <span key={r}>{r}</span>)}
        </div>
      </div>
    </div>
  );
}

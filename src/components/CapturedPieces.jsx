import { getCapturedPieces } from '../services/capturedPieces';
import './CapturedPieces.css';

// Black piece glyphs (captured by White) and white piece glyphs (captured by
// Black). Captured pieces are shown in the color they were on the board.
const BLACK_GLYPHS = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛' };
const WHITE_GLYPHS = { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' };

function Row({ label, glyphs, pieces, advantage }) {
  return (
    <div className="captured-row">
      <span className="captured-label">{label}</span>
      <span className="captured-pieces">
        {pieces.length === 0 ? (
          <span className="captured-none">—</span>
        ) : (
          pieces.map((type, index) => (
            <span key={`${type}-${index}`} className="captured-glyph">
              {glyphs[type]}
            </span>
          ))
        )}
      </span>
      {advantage > 0 && <span className="captured-advantage">+{advantage}</span>}
    </div>
  );
}

export default function CapturedPieces({ moveHistory, playerColor }) {
  const { w, b, advantage } = getCapturedPieces(moveHistory);
  const youAreWhite = playerColor === 'w';

  // Pieces YOU captured are the opponent-colored pieces; pieces the AI captured
  // are your-colored pieces.
  const youCaptured = youAreWhite ? w : b;
  const aiCaptured = youAreWhite ? b : w;
  const youGlyphs = youAreWhite ? BLACK_GLYPHS : WHITE_GLYPHS;
  const aiGlyphs = youAreWhite ? WHITE_GLYPHS : BLACK_GLYPHS;

  // advantage is White's lead; convert to "your" lead.
  const yourLead = youAreWhite ? advantage : -advantage;

  return (
    <div className="captured-panel">
      <Row label="YOU" glyphs={youGlyphs} pieces={youCaptured} advantage={yourLead} />
      <Row label="AI" glyphs={aiGlyphs} pieces={aiCaptured} advantage={-yourLead} />
    </div>
  );
}

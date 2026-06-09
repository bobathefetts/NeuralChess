import { useEffect, useRef } from 'react';
import './ThinkingPanel.css';

export default function ThinkingPanel({ text, isThinking, hasTokens }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  const showComputing = isThinking && !hasTokens;

  return (
    <div className={`thinking-panel ${isThinking ? 'active' : ''}`}>
      <div className="thinking-header">
        <span className="thinking-icon">{isThinking ? '[*]' : '[ ]'}</span>
        <span>NEURAL ACTIVITY</span>
        {isThinking && (
          <span className="thinking-live">{hasTokens ? 'STREAMING' : 'COMPUTING'}</span>
        )}
      </div>
      <div className="thinking-body" ref={scrollRef}>
        {showComputing && (
          <div className="computing-state">
            <div className="computing-dots">
              <span />
              <span />
              <span />
            </div>
            <span className="computing-label">processing position</span>
          </div>
        )}
        {text && (
          <span className="thinking-text">
            {text}
            {isThinking && <span className="thinking-cursor" />}
          </span>
        )}
        {!isThinking && !text && <span className="thinking-empty">no activity yet</span>}
      </div>
    </div>
  );
}

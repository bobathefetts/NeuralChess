import './DisclaimerModal.css';

export default function DisclaimerModal({ isOpen, onAccept }) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content disclaimer-modal">
        <div className="modal-header">
          <div className="modal-icon">!</div>
          <h2>SYSTEM ADVISORY</h2>
        </div>

        <div className="modal-body">
          <p className="primary-text">
            Neural Chess uses Large Language Models to power its opponent. Please keep the
            following in mind before you start:
          </p>
          <ul className="disclaimer-list">
            <li>
              <strong>Model behavior varies:</strong> Some LLMs are sharp, some are chaotic, and
              many will still miss obvious chess ideas.
            </li>
            <li>
              <strong>This is an experiment:</strong> The goal is to see how different models think
              through legal chess moves, not to simulate a classical engine.
            </li>
            <li>
              <strong>Failures are expected:</strong> Models may ramble, stall, or return illegal
              text that must be corrected or retried.
            </li>
          </ul>
          <p className="footer-text">
            By proceeding, you acknowledge that AI-driven chess play is experimental and may still
            behave inconsistently across providers and models.
          </p>
        </div>

        <div className="modal-footer">
          <button className="accept-btn" onClick={onAccept} type="button">
            I UNDERSTAND
          </button>
        </div>
      </div>
    </div>
  );
}

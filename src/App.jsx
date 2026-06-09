import { useCallback, useEffect, useRef, useState } from 'react';
import { useChessGame } from './hooks/useChessGame';
import { buildFallbackMove, getLLMMove, getMaxRetries } from './services/llmService';
import {
  DEFAULT_BOOTSTRAP,
  DEFAULT_LLM_CONFIG,
  DEFAULT_UI_STATE,
  checkForUpdates,
  clearLegacyBrowserState,
  clearStoredApiKey,
  getLegacyBrowserState,
  importLegacyState,
  loadBootstrap,
  logRuntimeEvent,
  openExternal,
  openLogsDirectory,
  saveRendererState,
  setStoredApiKey,
} from './services/runtimeBridge';
import ChessBoard from './components/ChessBoard';
import LLMConfig from './components/LLMConfig';
import MoveHistory from './components/MoveHistory';
import StatusPanel from './components/StatusPanel';
import ThinkingPanel from './components/ThinkingPanel';
import DisclaimerModal from './components/DisclaimerModal';
import './App.css';

export default function App() {
  const [llmConfig, setLlmConfig] = useState(DEFAULT_LLM_CONFIG);
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [playerColor, setPlayerColor] = useState(DEFAULT_UI_STATE.playerColor);
  const [difficulty, setDifficulty] = useState(DEFAULT_UI_STATE.difficulty);
  const [squareSize, setSquareSize] = useState(DEFAULT_UI_STATE.squareSize);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(
    DEFAULT_UI_STATE.disclaimerAccepted
  );
  const [runtimeInfo, setRuntimeInfo] = useState(DEFAULT_BOOTSTRAP.runtime);
  const [updateState, setUpdateState] = useState(DEFAULT_BOOTSTRAP.updateState);
  const [secureStorageAvailable, setSecureStorageAvailable] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const [gameStarted, setGameStarted] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState(null);
  const [thinkingText, setThinkingText] = useState('');
  const [hasTokens, setHasTokens] = useState(false);
  const [canRetry, setCanRetry] = useState(false);

  const {
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
  } = useChessGame();

  const isThinkingRef = useRef(false);
  const abortRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;

    async function bootstrap() {
      const bootstrapState = await loadBootstrap();
      if (isCancelled) {
        return;
      }

      setRuntimeInfo(bootstrapState.runtime);
      setUpdateState(bootstrapState.updateState);
      setSecureStorageAvailable(Boolean(bootstrapState.storedState.secureStorageAvailable));
      setLlmConfig({
        ...DEFAULT_LLM_CONFIG,
        ...bootstrapState.storedState.llmConfig,
      });
      setPlayerColor(bootstrapState.storedState.ui.playerColor || DEFAULT_UI_STATE.playerColor);
      setDifficulty(bootstrapState.storedState.ui.difficulty || DEFAULT_UI_STATE.difficulty);
      setSquareSize(bootstrapState.storedState.ui.squareSize || DEFAULT_UI_STATE.squareSize);
      setDisclaimerAccepted(Boolean(bootstrapState.storedState.ui.disclaimerAccepted));

      const legacyState = getLegacyBrowserState();
      if (legacyState && bootstrapState.runtime.isDesktop) {
        const migrated = await importLegacyState(legacyState);
        clearLegacyBrowserState();
        if (isCancelled) {
          return;
        }
        setLlmConfig({
          ...DEFAULT_LLM_CONFIG,
          ...migrated.llmConfig,
        });
        setPlayerColor(migrated.ui.playerColor || DEFAULT_UI_STATE.playerColor);
        setDifficulty(migrated.ui.difficulty || DEFAULT_UI_STATE.difficulty);
        setSquareSize(migrated.ui.squareSize || DEFAULT_UI_STATE.squareSize);
        setDisclaimerAccepted(Boolean(migrated.ui.disclaimerAccepted));
        logRuntimeEvent('legacy_state_imported', {
          apiType: legacyState.llmConfig.apiType,
        });
      }

      setIsHydrated(true);
    }

    bootstrap();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    saveRendererState({
      llmConfig,
      ui: {
        playerColor,
        squareSize,
        difficulty,
        disclaimerAccepted,
      },
    }).catch(() => {});
  }, [disclaimerAccepted, difficulty, isHydrated, llmConfig, playerColor, squareSize]);

  useEffect(() => {
    const handleGlobalError = (event) => {
      logRuntimeEvent('unhandled_rejection', {
        reason: event.reason?.message || String(event.reason || ''),
      });
    };
    window.addEventListener('unhandledrejection', handleGlobalError);
    return () => window.removeEventListener('unhandledrejection', handleGlobalError);
  }, []);

  const abortAI = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    isThinkingRef.current = false;
    setIsThinking(false);
  }, []);

  const triggerAIMove = useCallback(async () => {
    if (isThinkingRef.current) {
      return;
    }

    isThinkingRef.current = true;
    setIsThinking(true);
    setHasTokens(false);
    setThinkingText('');
    setError(null);
    setCanRetry(false);

    const controller = new AbortController();
    abortRef.current = controller;
    let lastErrorFeedback = '';
    const maxRetries = getMaxRetries(difficulty);

    try {
      for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        if (controller.signal.aborted) {
          break;
        }

        try {
          setHasTokens(false);
          setThinkingText('');

          const rawMove = await getLLMMove(
            {
              ...llmConfig,
              apiKey: apiKeyDraft || llmConfig.apiKey || '',
            },
            fen,
            moveHistory,
            game,
            difficulty,
            (_chunk, fullText) => {
              setHasTokens(true);
              setThinkingText(fullText);
            },
            controller.signal,
            lastErrorFeedback
          );

          if (controller.signal.aborted) {
            break;
          }

          const result = makeMove(rawMove.slice(0, 2), rawMove.slice(2, 4), rawMove[4] || 'q');
          if (result) {
            setError(null);
            logRuntimeEvent('move.accepted', {
              difficulty,
              move: rawMove,
              attempt,
            });
            break;
          }

          lastErrorFeedback = `Move "${rawMove}" was not legal in the current position. Choose a different move from the legal list only.`;
          if (attempt === maxRetries) {
            const fallbackMove = buildFallbackMove(game);
            if (fallbackMove && !controller.signal.aborted) {
              makeMove(
                fallbackMove.slice(0, 2),
                fallbackMove.slice(2, 4),
                fallbackMove[4] || 'q'
              );
              setError(
                `Model failed to produce a legal move after ${maxRetries} attempts. A random legal move was played.`
              );
            } else {
              setError(`AI suggested an illegal move and no fallback was available.`);
              setCanRetry(true);
            }
            break;
          }

          setError(`AI suggested an illegal move. Retrying (${attempt}/${maxRetries})...`);
        } catch (requestError) {
          if (requestError.name === 'AbortError') {
            break;
          }

          lastErrorFeedback = `${requestError.message} Return exactly one legal UCI move from the provided legal list.`;
          if (attempt === maxRetries) {
            const fallbackMove = buildFallbackMove(game);
            if (fallbackMove && !controller.signal.aborted) {
              makeMove(
                fallbackMove.slice(0, 2),
                fallbackMove.slice(2, 4),
                fallbackMove[4] || 'q'
              );
              setError(
                `Model failed after ${maxRetries} attempts. A random legal move was played.`
              );
            } else {
              setError(`AI failed after ${maxRetries} attempts: ${requestError.message}`);
              setCanRetry(true);
            }
          } else {
            setError(`${requestError.message} Retrying (${attempt}/${maxRetries})...`);
          }
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        abortRef.current = null;
        isThinkingRef.current = false;
        setIsThinking(false);
      }
    }
  }, [apiKeyDraft, difficulty, fen, game, llmConfig, makeMove, moveHistory]);

  useEffect(() => {
    if (!gameStarted || isGameOver()) {
      return;
    }
    if (getTurn() === playerColor) {
      return;
    }
    if (isThinkingRef.current) {
      return;
    }

    triggerAIMove();
  }, [fen, gameStarted, getTurn, isGameOver, playerColor, triggerAIMove]);

  const persistApiKey = useCallback(async () => {
    const nextApiKey = apiKeyDraft.trim();
    if (!nextApiKey) {
      return llmConfig.hasStoredApiKey;
    }

    const result = await setStoredApiKey(nextApiKey);
    setLlmConfig((current) => ({
      ...current,
      hasStoredApiKey: result.hasStoredApiKey,
      apiKey: runtimeInfo.isDesktop ? '' : nextApiKey,
    }));
    setApiKeyDraft('');
    return result.hasStoredApiKey;
  }, [apiKeyDraft, llmConfig.hasStoredApiKey, runtimeInfo.isDesktop]);

  const handleClearApiKey = useCallback(async () => {
    await clearStoredApiKey();
    setApiKeyDraft('');
    setLlmConfig((current) => ({
      ...current,
      apiKey: '',
      hasStoredApiKey: false,
    }));
  }, []);

  const handleSquareClick = useCallback(
    (square) => {
      if (!gameStarted || isGameOver()) {
        return;
      }
      if (getTurn() !== playerColor) {
        return;
      }
      selectSquare(square);
    },
    [gameStarted, getTurn, isGameOver, playerColor, selectSquare]
  );

  const handleStart = useCallback(async () => {
    await persistApiKey();
    abortAI();
    resetGame();
    setGameStarted(true);
    setError(null);
    setThinkingText('');
    setHasTokens(false);
    setCanRetry(false);
    isThinkingRef.current = false;
    setIsThinking(false);
    logRuntimeEvent('match.started', {
      apiType: llmConfig.apiType,
      model: llmConfig.model || '(provider-default)',
      difficulty,
      playerColor,
    });
  }, [abortAI, difficulty, llmConfig.apiType, llmConfig.model, persistApiKey, playerColor, resetGame]);

  const handleReset = useCallback(() => {
    abortAI();
    resetGame();
    setGameStarted(false);
    setError(null);
    setThinkingText('');
    setHasTokens(false);
    setCanRetry(false);
    isThinkingRef.current = false;
    setIsThinking(false);
    logRuntimeEvent('match.reset');
  }, [abortAI, resetGame]);

  const handleRetry = useCallback(() => {
    setError(null);
    setCanRetry(false);
    isThinkingRef.current = false;
    setIsThinking(false);
    triggerAIMove();
  }, [triggerAIMove]);

  const handleCheckForUpdates = useCallback(async () => {
    const nextState = await checkForUpdates();
    setUpdateState(nextState);
  }, []);

  const handleDownloadUpdate = useCallback(() => {
    if (updateState.downloadUrl) {
      openExternal(updateState.downloadUrl);
    }
  }, [updateState.downloadUrl]);

  const handleAcceptDisclaimer = useCallback(() => {
    setDisclaimerAccepted(true);
  }, []);

  const isBoardDisabled = !gameStarted || getTurn() !== playerColor || isGameOver() || isThinking;
  const boardTotalHeight = squareSize * 8 + 60;

  return (
    <div className="app" style={{ '--board-total-height': `${boardTotalHeight}px` }}>
      <header className="app-header">
        <div className="header-accent" />
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">[]</span>
            <span className="logo-text">
              NEURAL<span className="logo-chess">CHESS</span>
            </span>
          </div>
          <div className="header-tagline">
            HUMAN VS MACHINE | LLM CHESS LAB | v{runtimeInfo.version}
          </div>
        </div>
        <div className="header-accent" />
      </header>

      <main className="app-main">
        <aside className="left-panel">
          <LLMConfig
            config={llmConfig}
            apiKeyDraft={apiKeyDraft}
            onApiKeyDraftChange={setApiKeyDraft}
            onPersistApiKey={persistApiKey}
            onClearApiKey={handleClearApiKey}
            secureStorageAvailable={secureStorageAvailable}
            onChange={setLlmConfig}
            onStart={handleStart}
            disabled={gameStarted && !isGameOver()}
            playerColor={playerColor}
            onPlayerColorChange={setPlayerColor}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
          />

          <div className="size-control">
            <div className="size-label">
              <span>BOARD SIZE</span>
              <span className="size-value">{squareSize * 8}px</span>
            </div>
            <input
              type="range"
              min="44"
              max="100"
              value={squareSize}
              onChange={(event) => setSquareSize(Number(event.target.value))}
              className="size-slider"
            />
            <div className="size-ticks">
              <span>SMALL</span>
              <span>LARGE</span>
            </div>
          </div>

          <ThinkingPanel text={thinkingText} isThinking={isThinking} hasTokens={hasTokens} />
        </aside>

        <div className="board-area">
          <ChessBoard
            game={game}
            fen={fen}
            selectedSquare={selectedSquare}
            legalMoves={legalMoves}
            lastMove={lastMove}
            onSquareClick={handleSquareClick}
            playerColor={playerColor}
            disabled={isBoardDisabled}
            squareSize={squareSize}
          />
          {!gameStarted && (
            <div className="board-overlay">
              <div className="overlay-text">
                <div className="overlay-icon">[]</div>
                <div>CONFIGURE YOUR OPPONENT</div>
                <div className="overlay-sub">CHOOSE A MODEL AND START THE MATCH</div>
              </div>
            </div>
          )}
        </div>

        <aside className="right-panel">
          <StatusPanel
            gameStatus={gameStatus}
            turn={getTurn()}
            playerColor={playerColor}
            llmConfig={llmConfig}
            difficulty={difficulty}
            runtimeInfo={runtimeInfo}
            updateState={updateState}
            isThinking={isThinking}
            error={error}
            onReset={handleReset}
            onRetry={canRetry ? handleRetry : null}
            onCheckForUpdates={handleCheckForUpdates}
            onDownloadUpdate={updateState.downloadUrl ? handleDownloadUpdate : null}
            onOpenLogs={openLogsDirectory}
            gameStarted={gameStarted}
          />
          <MoveHistory moveHistory={moveHistory} />
        </aside>
      </main>

      <DisclaimerModal isOpen={!disclaimerAccepted} onAccept={handleAcceptDisclaimer} />
    </div>
  );
}

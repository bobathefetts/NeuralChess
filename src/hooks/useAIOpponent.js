import { useCallback, useRef, useState } from 'react';
import { buildFallbackMove, getLLMMove, getMaxRetries } from '../services/llmService';
import { logRuntimeEvent } from '../services/runtimeBridge';

// Owns the AI opponent's turn: requesting a move, streaming "thinking" text,
// the illegal-move/error retry loop with a random-legal fallback, and the
// abort plumbing. The host decides *when* it is the AI's turn and calls
// triggerAIMove(); this hook owns everything about *how* the move is produced.
export function useAIOpponent({ game, fen, moveHistory, llmConfig, apiKeyDraft, difficulty, makeMove }) {
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState(null);
  const [thinkingText, setThinkingText] = useState('');
  const [hasTokens, setHasTokens] = useState(false);
  const [canRetry, setCanRetry] = useState(false);

  const isThinkingRef = useRef(false);
  const abortRef = useRef(null);

  const abortAI = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    isThinkingRef.current = false;
    setIsThinking(false);
  }, []);

  // Full reset for starting or clearing a match.
  const resetAIState = useCallback(() => {
    setError(null);
    setThinkingText('');
    setHasTokens(false);
    setCanRetry(false);
    isThinkingRef.current = false;
    setIsThinking(false);
  }, []);

  // Clear just the error/retry surface (after undo or resign).
  const clearError = useCallback(() => {
    setError(null);
    setCanRetry(false);
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

  const retry = useCallback(() => {
    setError(null);
    setCanRetry(false);
    isThinkingRef.current = false;
    setIsThinking(false);
    triggerAIMove();
  }, [triggerAIMove]);

  const stop = useCallback(() => {
    abortAI();
    setError('AI move stopped.');
    setCanRetry(true);
    logRuntimeEvent('move.stopped');
  }, [abortAI]);

  return {
    isThinking,
    error,
    thinkingText,
    hasTokens,
    canRetry,
    triggerAIMove,
    abortAI,
    resetAIState,
    clearError,
    retry,
    stop,
  };
}

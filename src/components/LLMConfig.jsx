import { useCallback, useEffect, useRef, useState } from 'react';
import { listOllamaModels } from '../services/llmService';
import './LLMConfig.css';

const PRESET_CONFIGS = {
  ollama: {
    preset: 'ollama',
    apiType: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: '',
  },
  openai: {
    preset: 'openai',
    apiType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
  },
  anthropic: {
    preset: 'anthropic',
    apiType: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: '',
  },
  custom: {
    preset: 'custom',
    apiType: 'openai',
    baseUrl: '',
    model: '',
  },
};

const IS_EXE = import.meta.env.VITE_APP_MODE === 'EXE';

export default function LLMConfig({
  config,
  apiKeyDraft,
  onApiKeyDraftChange,
  onPersistApiKey,
  onClearApiKey,
  secureStorageAvailable,
  onChange,
  onStart,
  disabled,
  playerColor,
  onPlayerColorChange,
  difficulty,
  onDifficultyChange,
}) {
  const [ollamaModels, setOllamaModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const debounceRef = useRef(null);
  const fetchIdRef = useRef(0);

  const fetchOllamaModels = useCallback(async () => {
    const requestId = ++fetchIdRef.current;
    setLoadingModels(true);
    const models = await listOllamaModels(config.baseUrl || 'http://localhost:11434');
    if (requestId === fetchIdRef.current) {
      setOllamaModels(models);
      setLoadingModels(false);
    }
  }, [config.baseUrl]);

  useEffect(() => {
    if (config.preset !== 'ollama') {
      return undefined;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchOllamaModels();
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [config.preset, fetchOllamaModels]);

  function selectPreset(preset) {
    onChange({
      ...config,
      ...PRESET_CONFIGS[preset],
    });
  }

  function update(field, value) {
    onChange({ ...config, [field]: value });
  }

  const requiresExplicitModel = config.apiType === 'ollama';
  const canStart = requiresExplicitModel ? Boolean(config.model) : true;
  const hasStoredKey = Boolean(config.hasStoredApiKey);

  return (
    <div className="llm-config">
      <div className="config-header">
        <div className="config-icon">[]</div>
        <h2>AI OPPONENT CONFIG</h2>
      </div>

      {!IS_EXE && (
        <div className="preset-tabs">
          {['ollama', 'openai', 'anthropic', 'custom'].map((preset) => (
            <button
              key={preset}
              className={`preset-tab ${config.preset === preset ? 'active' : ''}`}
              onClick={() => selectPreset(preset)}
              disabled={disabled}
              type="button"
            >
              {preset.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {IS_EXE && <div className="exe-mode-banner">LOCAL OLLAMA MODE ACTIVE</div>}

      <div className="config-fields">
        {!IS_EXE && config.preset === 'custom' && (
          <div className="field-group">
            <label>API TYPE</label>
            <select
              value={config.apiType}
              onChange={(event) => update('apiType', event.target.value)}
              disabled={disabled}
            >
              <option value="ollama">Ollama</option>
              <option value="openai">OpenAI Compatible</option>
              <option value="anthropic">Anthropic Compatible</option>
            </select>
          </div>
        )}

        {config.apiType === 'ollama' && (
          <div className="field-group">
            <label>OLLAMA BASE URL</label>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(event) => update('baseUrl', event.target.value)}
              placeholder="http://localhost:11434"
              disabled={disabled}
            />
            <button
              className="refresh-btn"
              onClick={fetchOllamaModels}
              disabled={disabled}
              type="button"
            >
              {loadingModels ? '...' : 'REFRESH MODELS'}
            </button>
          </div>
        )}

        {config.apiType !== 'ollama' && config.preset === 'custom' && (
          <div className="field-group">
            <label>API BASE URL</label>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(event) => update('baseUrl', event.target.value)}
              placeholder="https://api.example.com/v1"
              disabled={disabled}
            />
          </div>
        )}

        <div className="field-group">
          <label>{requiresExplicitModel ? 'MODEL' : 'MODEL OVERRIDE (OPTIONAL)'}</label>
          {config.apiType === 'ollama' && ollamaModels.length > 0 ? (
            <select
              value={config.model}
              onChange={(event) => update('model', event.target.value)}
              disabled={disabled}
            >
              <option value="">-- select model --</option>
              {ollamaModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={config.model}
              onChange={(event) => update('model', event.target.value)}
              placeholder={
                config.apiType === 'ollama'
                  ? 'llama3.2, gemma3, deepseek-r1, ...'
                  : 'Leave blank to try provider default'
              }
              disabled={disabled}
            />
          )}
          {config.apiType === 'ollama' && ollamaModels.length === 0 && !loadingModels && (
            <span className="field-hint">No models found. Is Ollama running?</span>
          )}
          {config.apiType !== 'ollama' && (
            <span className="field-hint">
              Leave blank only if your provider supports a default model.
            </span>
          )}
        </div>

        {!IS_EXE && config.apiType !== 'ollama' && (
          <div className="field-group">
            <label>API KEY</label>
            <input
              type="password"
              value={apiKeyDraft}
              onChange={(event) => onApiKeyDraftChange(event.target.value)}
              placeholder={hasStoredKey ? 'Stored securely. Enter a new key to replace it.' : 'sk-...'}
              disabled={disabled}
            />
            <div className="key-actions">
              <button
                className="key-btn"
                type="button"
                onClick={onPersistApiKey}
                disabled={disabled || !apiKeyDraft.trim()}
              >
                SAVE KEY
              </button>
              <button
                className="key-btn key-btn-secondary"
                type="button"
                onClick={onClearApiKey}
                disabled={disabled || !hasStoredKey}
              >
                CLEAR KEY
              </button>
            </div>
            <span className="field-hint">
              {secureStorageAvailable
                ? hasStoredKey
                  ? 'API key is stored in desktop secure storage.'
                  : 'API key will be stored in desktop secure storage.'
                : 'Secure storage is unavailable. Keys will not persist in desktop mode.'}
            </span>
          </div>
        )}

        <div className="field-group">
          <label>PLAY AS</label>
          <div className="color-buttons">
            <button
              className={`color-btn ${playerColor === 'w' ? 'active' : ''}`}
              onClick={() => onPlayerColorChange('w')}
              disabled={disabled}
              type="button"
            >
              WHITE
            </button>
            <button
              className={`color-btn ${playerColor === 'b' ? 'active' : ''}`}
              onClick={() => onPlayerColorChange('b')}
              disabled={disabled}
              type="button"
            >
              BLACK
            </button>
          </div>
        </div>

        <div className="field-group">
          <label>DIFFICULTY</label>
          <div className="difficulty-buttons">
            {['easy', 'normal', 'hard'].map((level) => (
              <button
                key={level}
                className={`difficulty-btn difficulty-${level} ${
                  difficulty === level ? 'active' : ''
                }`}
                onClick={() => onDifficultyChange(level)}
                disabled={disabled}
                type="button"
              >
                {level.toUpperCase()}
              </button>
            ))}
          </div>
          <span className="field-hint">
            Easy is loose and chatty, normal is balanced, hard is the strictest tactical prompt.
          </span>
        </div>
      </div>

      <button className="start-btn" onClick={onStart} disabled={disabled || !canStart} type="button">
        <span className="btn-icon">{'>'}</span>
        INITIALIZE MATCH
      </button>
    </div>
  );
}

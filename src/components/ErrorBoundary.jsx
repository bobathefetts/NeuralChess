import { Component } from 'react';
import { logRuntimeEvent } from '../services/runtimeBridge';
import './ErrorBoundary.css';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    logRuntimeEvent('renderer.render_crash', {
      message: error?.message || String(error),
      stack: (error?.stack || '').slice(0, 2000),
      componentStack: (info?.componentStack || '').slice(0, 2000),
    });
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="error-boundary">
        <div className="error-boundary-panel">
          <div className="error-boundary-title">! RENDERER FAULT</div>
          <p>Something went wrong while rendering Neural Chess.</p>
          <pre className="error-boundary-detail">
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            type="button"
            className="error-boundary-reload"
            onClick={() => window.location.reload()}
          >
            RELOAD APP
          </button>
        </div>
      </div>
    );
  }
}

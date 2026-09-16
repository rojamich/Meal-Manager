import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so a bad component shows a recoverable screen instead of
 * blanking the app. Data lives in IndexedDB, so nothing is lost by reloading.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[app] render error", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="container">
        <div className="panel">
          <h2>This screen ran into a problem</h2>
          <p className="muted">
            Your data is safe — everything is stored on this device and nothing was lost.
            Reloading clears this most of the time.
          </p>
          <p className="info-box" style={{ overflowWrap: "anywhere" }}>
            {error.message || String(error)}
          </p>
          <div className="row">
            <button type="button" onClick={() => window.location.reload()}>
              Reload the app
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => this.setState({ error: null })}
            >
              Try this screen again
            </button>
          </div>
        </div>
      </div>
    );
  }
}

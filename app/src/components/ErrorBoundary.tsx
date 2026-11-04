import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearContentCache } from '../content/loader';

interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  retry = () => {
    clearContentCache();
    this.setState({ error: null });
  };

  override render() {
    if (this.state.error) {
      return (
        <div className="notice error" role="alert">
          <p>
            <strong>表示中に問題が起きました。</strong>
          </p>
          <p className="small">{this.state.error.message}</p>
          <div className="btn-row">
            <button type="button" className="btn" onClick={this.retry}>
              再試行
            </button>
            <a className="btn" href="#/">
              ホームへ
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

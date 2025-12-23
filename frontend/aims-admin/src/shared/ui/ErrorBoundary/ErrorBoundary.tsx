import React, { Component, ErrorInfo, ReactNode } from 'react';
import { errorReporter } from '../../lib/errorReporter';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 에러 리포터에 전송
    errorReporter.reportComponentError(
      error,
      'ErrorBoundary',
      { componentStack: errorInfo.componentStack || undefined }
    );
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary__content">
            <div className="error-boundary__icon">!</div>
            <h2 className="error-boundary__title">오류가 발생했습니다</h2>
            <p className="error-boundary__message">
              {this.state.error?.message || '알 수 없는 오류가 발생했습니다.'}
            </p>
            <p className="error-boundary__hint">
              이 오류는 자동으로 관리자에게 보고되었습니다.
            </p>
            <button
              className="error-boundary__button"
              onClick={this.handleRetry}
            >
              다시 시도
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

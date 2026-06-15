import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback UI to show instead of the default error state */
  fallback?: ReactNode;
  /** Callback invoked with the caught error and error info */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary — a class component that catches JavaScript errors
 * anywhere in its child component tree and displays a fallback UI.
 *
 * Rules of Error Boundaries:
 * - MUST be a class component (React does not support hooks for error boundaries)
 * - Catches errors during rendering, lifecycle methods, and constructors
 * - Does NOT catch errors in event handlers, async code, or SSR
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary] Caught an error:", error, errorInfo);
    }
    this.props.onError?.(error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // If a custom fallback is provided, render it instead of the default UI
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      const isDev = import.meta.env.DEV;
      const error = this.state.error;

      return (
        <div
          role="alert"
          className="min-h-screen flex items-center justify-center bg-background p-8"
        >
          <div className="max-w-md w-full space-y-6 text-center">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground">
                Something went wrong
              </h2>
              <p className="text-muted-foreground">
                An unexpected error occurred. Please try again.
              </p>
            </div>

            {isDev && error && (
              <pre className="mt-4 rounded-lg bg-muted p-4 text-left text-sm text-muted-foreground overflow-auto max-h-48 border">
                {error.name}: {error.message}
              </pre>
            )}

            <button
              onClick={this.handleReset}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

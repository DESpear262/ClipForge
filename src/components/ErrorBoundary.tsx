import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

/**
 * Props interface for ErrorBoundary component
 */
interface Props {
  children: ReactNode;
}

/**
 * State interface for ErrorBoundary component
 */
interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary component for catching and handling React errors
 * 
 * This component catches errors during rendering, lifecycle methods, and constructors
 * of the whole tree below it. Errors are logged to the console and displayed
 * to the user with an option to retry.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  /**
   * Update state so the next render will show the fallback UI
   */
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  /**
   * Log error details to console
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  /**
   * Reset error state and retry rendering
   */
  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-red-900">
          <div className="text-center p-8 max-w-lg">
            <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
            <p className="text-red-200 mb-4">{this.state.error?.message}</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={this.handleReset}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded transition-colors"
              >
                Reload app
              </button>
            </div>
            {this.state.error?.stack && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-red-300 hover:text-red-200">
                  Show error details
                </summary>
                <pre className="mt-2 text-xs bg-black bg-opacity-50 p-4 rounded overflow-auto max-h-64">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;


import React from "react";
import { AlertTriangle, RotateCcw, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by ErrorBoundary:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex items-center justify-center px-4"
          style={{ background: "linear-gradient(135deg, #0D0F35 0%, #1F1B6B 50%, #0B7B6E 100%)" }}
        >
          <div className="w-full max-w-md">
            <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm p-8 shadow-lg">
              {/* Error Icon */}
              <div className="flex justify-center mb-6">
                <div className="p-3 rounded-full bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
              </div>

              {/* Error Message */}
              <h1 className="text-2xl font-bold text-foreground text-center mb-2">
                Something went wrong
              </h1>
              <p className="text-center text-muted-foreground mb-6">
                We encountered an unexpected error. Please try again or reload the page.
              </p>

              {/* Error Details (development only) */}
              {process.env.NODE_ENV === "development" && this.state.error && (
                <div className="mb-6 p-3 rounded bg-destructive/5 border border-destructive/20 overflow-auto max-h-32">
                  <p className="text-xs text-destructive font-mono whitespace-pre-wrap break-words">
                    {this.state.error.message}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 flex-col sm:flex-row">
                <button
                  onClick={this.handleReset}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors flex-1"
                >
                  <RotateCcw className="h-4 w-4" />
                  Try Again
                </button>
                <button
                  onClick={this.handleReload}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-secondary/50 px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors flex-1"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

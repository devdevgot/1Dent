import { Component, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { reportClientError } from "@/lib/report-error";
import { isChunkLoadError, reloadOnceOnChunkError } from "@/lib/chunk-reload";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  recoveringChunk: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, recoveringChunk: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      recoveringChunk: isChunkLoadError(error),
    };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] caught:", error, info.componentStack);
    if (isChunkLoadError(error)) {
      // Stale PWA/deploy chunk — recover instead of showing the dead-end UI.
      try {
        reloadOnceOnChunkError(error);
      } catch {
        // non-chunk path shouldn't reach here
      }
      return;
    }
    reportClientError({
      source: "dental-crm",
      message: error.message,
      stack: error.stack ?? null,
      code: "REACT_BOUNDARY",
      url: typeof window !== "undefined" ? window.location.href : null,
      metadata: { componentStack: info.componentStack },
    });
  }

  reset = () => {
    if (this.state.error && isChunkLoadError(this.state.error)) {
      try {
        reloadOnceOnChunkError(this.state.error);
      } catch {
        window.location.reload();
      }
      return;
    }
    this.setState({ hasError: false, error: null, recoveringChunk: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.state.recoveringChunk) {
        return (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">Обновляем приложение…</p>
          </div>
        );
      }
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 p-6 text-center">
          <p className="text-sm text-muted-foreground">Что-то пошло не так. Попробуйте обновить.</p>
          <button
            onClick={this.reset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Обновить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

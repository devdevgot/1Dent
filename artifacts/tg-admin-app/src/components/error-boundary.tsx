import { Component, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

function reportBoundaryError(message: string, stack: string | null, componentStack: string) {
  void fetch("/api/errors/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "tg-admin",
      severity: "error",
      message,
      stack,
      code: "REACT_BOUNDARY",
      url: typeof window !== "undefined" ? window.location.href : null,
      metadata: { componentStack },
    }),
  }).catch(() => {});
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    reportBoundaryError(error.message, error.stack ?? null, info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-6 text-center font-manrope">
          <p className="text-sm text-[#64748b]">Что-то пошло не так. Попробуйте обновить.</p>
          <button
            type="button"
            onClick={this.reset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-[#1f75fe] text-white"
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

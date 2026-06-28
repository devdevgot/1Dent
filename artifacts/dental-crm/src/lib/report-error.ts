type ErrorSource = "dental-crm" | "tg-admin";
type ErrorSeverity = "error" | "warning" | "fatal";

export interface ReportErrorPayload {
  source: ErrorSource;
  severity?: ErrorSeverity;
  message: string;
  stack?: string | null;
  code?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function reportClientError(payload: ReportErrorPayload): void {
  if (typeof window === "undefined") return;

  void fetch("/api/errors/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export function installGlobalErrorHandlers(source: ErrorSource): () => void {
  if (typeof window === "undefined") return () => {};

  const onError = (event: ErrorEvent) => {
    reportClientError({
      source,
      message: event.message || "window.onerror",
      stack: event.error instanceof Error ? event.error.stack ?? null : null,
      url: event.filename || window.location.href,
      metadata: {
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    reportClientError({
      source,
      severity: "error",
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack ?? null : null,
      url: window.location.href,
      code: "UNHANDLED_REJECTION",
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

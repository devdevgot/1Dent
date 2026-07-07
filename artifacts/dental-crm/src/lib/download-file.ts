import { customFetch, ApiError } from "@workspace/api-client-react";

/**
 * Download a binary file from an authenticated API path (Excel, PDF, etc.).
 * Uses the same auth / base URL / branch headers as the rest of the app.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const blob = await customFetch<Blob>(path, { responseType: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function downloadErrorMessage(err: unknown): string | undefined {
  if (err instanceof ApiError) {
    if (typeof err.data === "string" && err.data.trim()) return err.data.trim();
    if (err.data && typeof err.data === "object") {
      const msg = (err.data as Record<string, unknown>).error ?? (err.data as Record<string, unknown>).message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
    return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return undefined;
}

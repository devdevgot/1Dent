import { getBaseUrl } from "@/lib/base-url";
import { getBranchRequestHeaders } from "@/lib/branch-context";

function parseErrorMessage(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) return `HTTP ${status}`;
  try {
    const json = JSON.parse(trimmed) as { error?: string; message?: string };
    return json.error ?? json.message ?? trimmed;
  } catch {
    return trimmed;
  }
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = header.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)"?/i);
  return match?.[1]?.trim() || fallback;
}

/**
 * Download a binary file from an authenticated API path.
 * Mirrors the proven pattern from migration.tsx export.
 */
export async function downloadFile(path: string, fallbackFilename: string): Promise<void> {
  const token = localStorage.getItem("auth_token");
  const base = getBaseUrl();

  const buildHeaders = (withBranch: boolean): Record<string, string> => ({
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(withBranch ? getBranchRequestHeaders() : {}),
  });

  let res = await fetch(`${base}${path}`, {
    headers: buildHeaders(true),
    credentials: "include",
  });

  // Stale branch id in localStorage → 403; retry without branch scope.
  if (res.status === 403 && getBranchRequestHeaders()["x-clinic-branch-id"]) {
    res = await fetch(`${base}${path}`, {
      headers: buildHeaders(false),
      credentials: "include",
    });
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseErrorMessage(text, res.status));
  }

  const blob = await res.blob();
  if (!blob.size) {
    throw new Error("Сервер вернул пустой файл");
  }

  const filename = filenameFromDisposition(res.headers.get("content-disposition"), fallbackFilename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error && err.message) return err.message;
  return undefined;
}

import { fetchWithAuth } from "@workspace/api-client-react";
import { getBranchRequestHeaders } from "@/lib/branch-context";

const EXPORT_ACCEPT =
  "application/pdf, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream";

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

function isErrorContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return (
    ct.includes("application/json") ||
    ct.includes("text/html") ||
    ct.startsWith("text/plain")
  );
}

async function readResponseError(res: Response): Promise<string> {
  const text = await res.text();
  return parseErrorMessage(text, res.status);
}

/**
 * Download a binary file from an authenticated API path.
 * Uses the same auth + branch headers as the rest of the CRM API client.
 */
export async function downloadFile(path: string, fallbackFilename: string): Promise<void> {
  const hadBranch = Boolean(getBranchRequestHeaders()["x-clinic-branch-id"]);
  const fetchOpts = { headers: { Accept: EXPORT_ACCEPT } } as const;

  let res = await fetchWithAuth(path, fetchOpts);

  // Stale branch id in localStorage → 403; retry without branch scope.
  if (res.status === 403 && hadBranch) {
    res = await fetchWithAuth(path, { ...fetchOpts, skipBranchHeader: true });
  }

  if (!res.ok) {
    throw new Error(await readResponseError(res));
  }

  const contentType = res.headers.get("content-type");
  if (isErrorContentType(contentType)) {
    throw new Error(await readResponseError(res));
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

import type { OfflineOpType } from "./types";

export type MatchedOfflineRoute =
  | {
      type: Exclude<OfflineOpType, "update_tooth">;
      resourceId: string;
      method: string;
    }
  | {
      type: "update_tooth";
      resourceId: string;
      toothFdi: number;
      method: string;
    };

function pathnameOf(url: string): string {
  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return new URL(url).pathname;
    }
  } catch {
    // fall through
  }
  return url.split("?")[0] ?? url;
}

/**
 * Map REST mutations that are safe to queue offline.
 * Messaging, AI, contracts, inventory absolute qty — intentionally excluded.
 */
export function matchOfflineMutation(
  method: string,
  url: string,
): MatchedOfflineRoute | null {
  const m = method.toUpperCase();
  const path = pathnameOf(url);

  let match = path.match(/^\/api\/patients\/([^/]+)\/status\/?$/);
  if (match && m === "PATCH") {
    return { type: "update_patient_status", resourceId: match[1]!, method: m };
  }

  match = path.match(/^\/api\/patients\/([^/]+)\/teeth\/(\d+)\/?$/);
  if (match && m === "PUT") {
    return {
      type: "update_tooth",
      resourceId: match[1]!,
      toothFdi: Number(match[2]),
      method: m,
    };
  }

  match = path.match(/^\/api\/patients\/([^/]+)\/interactions\/?$/);
  if (match && m === "POST") {
    return { type: "add_interaction", resourceId: match[1]!, method: m };
  }

  match = path.match(/^\/api\/patients\/([^/]+)\/?$/);
  if (match && m === "PUT") {
    return { type: "update_patient", resourceId: match[1]!, method: m };
  }

  return null;
}

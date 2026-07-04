import type { Request, Response, NextFunction } from "express";
import { isDatabaseReady } from "../shared/db-ready";

const EXEMPT_PATHS = ["/api/healthz", "/healthz"];
const API_PREFIXES = ["/api", "/p", "/r", "/ref", "/wa"];

/** Allow SPA shell and static assets while Postgres migrations finish. */
function isPublicFrontendRequest(req: Request): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const path = req.path;
  if (API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return false;
  }
  return true;
}

export function dbReadyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;
  if (EXEMPT_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    next();
    return;
  }

  if (isPublicFrontendRequest(req)) {
    next();
    return;
  }

  if (isDatabaseReady()) {
    next();
    return;
  }

  res.status(503).json({
    success: false,
    error: "Система ещё инициализируется. Подождите несколько секунд и попробуйте снова.",
    code: "DB_NOT_READY",
  });
}

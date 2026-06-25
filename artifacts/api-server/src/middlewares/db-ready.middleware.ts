import type { Request, Response, NextFunction } from "express";
import { isDatabaseReady } from "../shared/db-ready";

const EXEMPT_PATHS = ["/api/healthz", "/healthz"];

export function dbReadyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;
  if (EXEMPT_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
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

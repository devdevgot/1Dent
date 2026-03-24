import type { Request, Response, NextFunction } from "express";
import { enqueueActionLog } from "../modules/logs/action-log.queue";

const LOGGABLE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function entityTypeFromUrl(url: string): { entityType: string; entityId?: string } {
  const segments = url.replace(/^\/api\//, "").split("?")[0]!.split("/");
  const entityType = segments[0] ?? "unknown";
  const entityId = segments[1] && segments[1].length > 0 ? segments[1] : undefined;
  return { entityType, entityId };
}

function actionTypeFromMethod(method: string): string {
  switch (method) {
    case "POST": return "CREATE";
    case "PUT":
    case "PATCH": return "UPDATE";
    case "DELETE": return "DELETE";
    default: return method;
  }
}

export function actionLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!LOGGABLE_METHODS.has(req.method)) {
    return next();
  }

  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    const statusCode = res.statusCode;
    if (statusCode >= 200 && statusCode < 300 && req.user) {
      const { entityType, entityId } = entityTypeFromUrl(req.url ?? "");
      enqueueActionLog({
        clinicId: req.user.clinicId,
        userId: req.user.userId,
        actionType: actionTypeFromMethod(req.method),
        entityType,
        entityId,
        details: { method: req.method, url: req.url, status: statusCode },
        ipAddress:
          (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
          req.socket?.remoteAddress,
      }).catch(() => {});
    }
    return originalJson(body);
  };

  next();
}

import { Request, Response, NextFunction } from "express";
import { AppError, ConflictError } from "../shared/errors";
import { errorEventsService } from "../modules/error-events/error-events.service";

const GENERIC_ERROR_MESSAGE = "Произошла ошибка на сервере. Попробуйте позже.";

function extractPgCode(err: unknown): string | null {
  let current: unknown = err;
  for (let depth = 0; depth < 6 && current; depth++) {
    if (current && typeof current === "object" && "code" in current) {
      const code = (current as { code: unknown }).code;
      if (typeof code === "string" && code.length > 0) {
        return code;
      }
    }
    current =
      current && typeof current === "object" && "cause" in current
        ? (current as { cause: unknown }).cause
        : null;
  }
  return null;
}

function mapDatabaseError(err: unknown): AppError | null {
  const code = extractPgCode(err);
  if (!code) return null;

  switch (code) {
    case "23505":
      return new ConflictError("Этот email уже зарегистрирован");
    case "42P01":
      return new AppError(
        "База данных ещё не готова. Подождите несколько секунд и попробуйте снова.",
        503,
        "DB_NOT_READY",
      );
    case "42703":
      return new AppError(
        "База данных обновляется. Подождите минуту и попробуйте снова.",
        503,
        "DB_SCHEMA_OUTDATED",
      );
    case "22P02":
      return new AppError(
        "База данных обновляется. Подождите минуту и попробуйте снова.",
        503,
        "DB_SCHEMA_OUTDATED",
      );
    case "ECONNREFUSED":
    case "ENOTFOUND":
    case "ETIMEDOUT":
      return new AppError(
        "Не удалось подключиться к базе данных. Попробуйте позже.",
        503,
        "DB_UNAVAILABLE",
      );
    default:
      return null;
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const mapped = mapDatabaseError(err);
  if (mapped) {
    req.log?.warn({ err, code: mapped.code }, mapped.message);
    if (mapped.statusCode >= 500) {
      errorEventsService.captureFromRequest(mapped, req, { code: mapped.code });
    }
    res.status(mapped.statusCode).json({
      success: false,
      error: mapped.message,
      code: mapped.code,
    });
    return;
  }

  if (err instanceof AppError) {
    req.log?.warn({ err, code: err.code }, err.message);
    if (err.statusCode >= 500) {
      errorEventsService.captureFromRequest(err, req, {
        code: err.code,
        severity: "error",
      });
    }
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
    return;
  }

  req.log?.error({ err }, "Unhandled error");
  errorEventsService.captureFromRequest(err, req, {
    code: "INTERNAL_ERROR",
    severity: "error",
  });
  res.status(500).json({
    success: false,
    error: GENERIC_ERROR_MESSAGE,
    code: "INTERNAL_ERROR",
  });
}

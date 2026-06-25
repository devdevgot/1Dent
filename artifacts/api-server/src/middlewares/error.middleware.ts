import { Request, Response, NextFunction } from "express";
import { AppError, ConflictError } from "../shared/errors";

const GENERIC_ERROR_MESSAGE = "Произошла ошибка на сервере. Попробуйте позже.";

function mapDatabaseError(err: unknown): AppError | null {
  if (!err || typeof err !== "object" || !("code" in err)) return null;
  const code = String((err as { code: unknown }).code);

  switch (code) {
    case "23505":
      return new ConflictError("Этот email уже зарегистрирован");
    case "42P01":
      return new AppError(
        "База данных ещё не готова. Подождите несколько секунд и попробуйте снова.",
        503,
        "DB_NOT_READY",
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
    res.status(mapped.statusCode).json({
      success: false,
      error: mapped.message,
      code: mapped.code,
    });
    return;
  }

  if (err instanceof AppError) {
    req.log?.warn({ err, code: err.code }, err.message);
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
    return;
  }

  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({
    success: false,
    error: GENERIC_ERROR_MESSAGE,
    code: "INTERNAL_ERROR",
  });
}

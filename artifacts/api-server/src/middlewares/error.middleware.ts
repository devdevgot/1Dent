import { Request, Response, NextFunction } from "express";
import { AppError } from "../shared/errors";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
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
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  });
}

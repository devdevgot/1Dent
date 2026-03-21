import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError, ForbiddenError } from "../shared/errors";
import type { UserRole } from "@workspace/db";

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required. Set it before starting the server.");
  }
  return secret;
}

export interface JwtPayload {
  userId: string;
  clinicId: string;
  role: UserRole;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    const token = req.cookies?.["auth_token"];

    if (!token) {
      throw new UnauthorizedError("Authentication required");
    }

    const payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired token"));
  }
}

export function roleGuard(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError("Insufficient permissions"));
    }
    next();
  };
}

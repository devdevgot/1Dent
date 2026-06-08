import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "@workspace/db";
import { UnauthorizedError, ForbiddenError } from "../shared/errors";
import type { UserRole } from "@workspace/db";

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. The server should have set it at startup.",
    );
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
      /** JWT clinic id (parent / home cabinet) — unchanged when viewing a branch */
      homeClinicId?: string;
    }
  }
}

async function resolveBranchClinicId(
  homeClinicId: string,
  role: UserRole,
  branchHeader: string | string[] | undefined,
): Promise<string> {
  const branchId = typeof branchHeader === "string" ? branchHeader.trim() : "";
  if (!branchId || branchId === homeClinicId) {
    return homeClinicId;
  }

  if (role !== "owner") {
    throw new ForbiddenError("Only clinic owners can switch branches");
  }

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM clinics WHERE id = $1 AND parent_clinic_id = $2 LIMIT 1`,
    [branchId, homeClinicId],
  );

  if (rows.length === 0) {
    throw new ForbiddenError("Invalid branch");
  }

  return branchId;
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const cookieToken = req.cookies?.["auth_token"];
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const queryToken = typeof req.query["token"] === "string" ? req.query["token"] : null;
    const token = cookieToken || bearerToken || queryToken;

    if (!token) {
      throw new UnauthorizedError("Authentication required");
    }

    const payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
    req.homeClinicId = payload.clinicId;
    const effectiveClinicId = await resolveBranchClinicId(
      payload.clinicId,
      payload.role,
      req.headers["x-clinic-branch-id"],
    );
    req.user = { ...payload, clinicId: effectiveClinicId };
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return next(err);
    }
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

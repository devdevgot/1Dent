import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

const EXEMPT_PREFIXES = [
  "/api/auth/",
  "/api/healthz",
  "/api/tma/",
  "/api/webhook/",
  "/api/storage/",
];

function isExempt(url: string): boolean {
  return EXEMPT_PREFIXES.some((p) => url.startsWith(p));
}

export async function planGateMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (isExempt(req.originalUrl)) return next();
  if (!req.user?.clinicId) return next();

  try {
    const { rows } = await pool.query<{ plan: string; trial_ends_at: string | null; is_active: boolean }>(
      `SELECT plan, trial_ends_at, is_active FROM clinics WHERE id = $1 LIMIT 1`,
      [req.user.clinicId],
    );

    const clinic = rows[0];
    if (!clinic) return next();

    if (!clinic.is_active) {
      res.status(403).json({
        success: false,
        error: "Клиника деактивирована. Обратитесь к администратору платформы.",
        code: "CLINIC_INACTIVE",
      });
      return;
    }

    const hasPaidPlan = clinic.plan !== "free";
    const trialActive = clinic.trial_ends_at && new Date(clinic.trial_ends_at) > new Date();

    if (!hasPaidPlan && !trialActive) {
      res.status(402).json({
        success: false,
        error: "Для доступа к системе необходимо подключить тариф.",
        code: "NO_ACTIVE_PLAN",
      });
      return;
    }

    next();
  } catch {
    next();
  }
}

import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

const EXEMPT_PREFIXES = [
  "/api/auth/",
  "/api/healthz",
  "/api/tma/",
  "/api/webhook/",
  "/api/storage/",
  "/api/plan-requests",
  "/api/ai-credits",
];

function isExempt(url: string): boolean {
  return EXEMPT_PREFIXES.some((p) => url.startsWith(p));
}

export async function planGateMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (isExempt(req.originalUrl)) return next();
  if (!req.user?.clinicId) return next();

  try {
    const { rows } = await pool.query<{ plan: string; trial_ends_at: string | null; plan_expires_at: string | null; is_active: boolean }>(
      `SELECT plan, trial_ends_at, plan_expires_at, is_active FROM clinics WHERE id = $1 LIMIT 1`,
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

    const now = new Date();
    const hasPaidPlan = clinic.plan !== "free";
    const planNotExpired = !clinic.plan_expires_at || new Date(clinic.plan_expires_at) > now;
    const trialActive = clinic.trial_ends_at && new Date(clinic.trial_ends_at) > now;

    if ((!hasPaidPlan || !planNotExpired) && !trialActive) {
      res.status(402).json({
        success: false,
        error: hasPaidPlan && !planNotExpired
          ? "Срок действия тарифа истёк. Продлите подписку."
          : "Для доступа к системе необходимо подключить тариф.",
        code: "NO_ACTIVE_PLAN",
      });
      return;
    }

    next();
  } catch {
    next();
  }
}

import { Router, type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { errorEventSources, errorEventSeverities } from "@workspace/db";
import { rateLimit } from "../../middlewares/rate-limit.middleware";
import type { JwtPayload } from "../../middlewares/auth.middleware";
import { errorEventsService } from "./error-events.service";

const router = Router();

const reportSchema = z.object({
  source: z.enum(errorEventSources),
  severity: z.enum(errorEventSeverities).optional(),
  message: z.string().min(1).max(5_000),
  stack: z.string().max(20_000).optional().nullable(),
  code: z.string().max(100).optional().nullable(),
  url: z.string().max(2_000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

function readOptionalUser(req: Request): { clinicId?: string; userId?: string } {
  try {
    const cookieToken = req.cookies?.["auth_token"];
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const token = cookieToken || bearerToken;
    if (!token) return {};
    const payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
    return { clinicId: payload.clinicId, userId: payload.userId };
  } catch {
    return {};
  }
}

router.post(
  "/report",
  rateLimit({ windowSeconds: 60, maxRequests: 40, keyPrefix: "rl:errors" }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = reportSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.message });
        return;
      }

      const userCtx = readOptionalUser(req);
      await errorEventsService.capture({
        ...parsed.data,
        clinicId: userCtx.clinicId ?? null,
        userId: userCtx.userId ?? null,
        userAgent: req.headers["user-agent"] as string | undefined,
        requestId: String(req.id ?? ""),
      });

      res.status(201).json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

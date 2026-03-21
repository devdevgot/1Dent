import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { AuthService } from "./auth.service";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";

const router: IRouter = Router();
const authService = new AuthService();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const registerSchema = z.object({
  clinicName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }

  const result = await authService.register(parsed.data).catch(next);
  if (!result) return;

  res.cookie("auth_token", result.token, COOKIE_OPTIONS);
  res.status(201).json({
    success: true,
    data: { user: result.user, clinic: result.clinic },
  });
});

router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }

  const result = await authService.login(parsed.data).catch(next);
  if (!result) return;

  res.cookie("auth_token", result.token, COOKIE_OPTIONS);
  res.json({
    success: true,
    data: { user: result.user, clinic: result.clinic },
  });
});

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("auth_token");
  res.json({ success: true, message: "Logged out successfully" });
});

router.get("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const result = await authService.getMe(req.user!.userId, req.user!.clinicId).catch(next);
  if (!result) return;

  res.json({ success: true, data: result });
});

export default router;

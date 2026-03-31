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

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
});

router.post("/forgot-password", async (req: Request, res: Response, next: NextFunction) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }

  const result = await authService.requestPasswordReset(parsed.data.email).catch(next);
  if (!result) return;

  const response: Record<string, unknown> = { success: true, message: "If this email is registered, a reset link has been sent." };
  // In development, include the token so the UI can show a direct link
  if (process.env["NODE_ENV"] !== "production" && result.token) {
    response["devToken"] = result.token;
  }
  res.json(response);
});

router.post("/reset-password", async (req: Request, res: Response, next: NextFunction) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }

  await authService.resetPassword(parsed.data.token, parsed.data.newPassword).catch(next);
  res.json({ success: true, message: "Password has been reset successfully." });
});

router.get("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const result = await authService.getMe(req.user!.userId, req.user!.clinicId).catch(next);
  if (!result) return;

  res.json({ success: true, data: result });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

router.put("/change-password", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }

  try {
    await authService.changePassword(req.user!.userId, parsed.data.currentPassword, parsed.data.newPassword);
    res.json({ success: true, message: "Password changed successfully." });
  } catch (err) {
    next(err);
  }
});

export default router;

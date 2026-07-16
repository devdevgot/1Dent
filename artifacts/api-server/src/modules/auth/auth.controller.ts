import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { registrationUseCaseIds } from "@workspace/db";
import { AuthService } from "./auth.service";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { ValidationError } from "../../shared/errors";
import { whatsappOtpService } from "./whatsapp-otp.service";

const router: IRouter = Router();
const authService = new AuthService();

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const registerSchema = z
  .object({
    clinicName: z.string().min(2),
    name: z.string().min(2),
    email: z.string().email().optional(),
    password: z.string().min(6),
    phone: z.string().min(10).optional(),
    phoneVerificationToken: z.string().min(16).optional(),
    useCases: z.array(z.enum(registrationUseCaseIds)).optional().default([]),
  })
  .superRefine((data, ctx) => {
    const hasWhatsapp = Boolean(data.phone && data.phoneVerificationToken);
    if (!data.email && !hasWhatsapp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Подтвердите WhatsApp или укажите email",
        path: ["phone"],
      });
    }
  });

const loginSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(10).optional(),
    password: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    if (!data.email && !data.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите номер WhatsApp",
        path: ["phone"],
      });
    }
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
    data: { user: result.user, clinic: result.clinic, token: result.token },
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
    data: { user: result.user, clinic: result.clinic, token: result.token },
  });
});

const whatsappRequestOtpSchema = z.object({
  phone: z.string().min(10),
  purpose: z.enum(["login", "register", "reset_password"]),
});

router.post("/whatsapp/request-otp", async (req: Request, res: Response, next: NextFunction) => {
  const parsed = whatsappRequestOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }

  try {
    if (parsed.data.purpose === "reset_password") {
      await authService.assertPhoneAccountForPasswordReset(parsed.data.phone);
    }
    if (parsed.data.purpose === "register") {
      await authService.assertPhoneAvailableForRegistration(parsed.data.phone);
    }

    const result = await whatsappOtpService.requestOtp(parsed.data.phone, parsed.data.purpose);
    const response: Record<string, unknown> = {
      success: true,
      data: { phone: result.phone },
    };
    if (result.devCode) response["devCode"] = result.devCode;
    res.json(response);
  } catch (err) {
    next(err);
  }
});

const whatsappVerifyOtpSchema = z.object({
  phone: z.string().min(10),
  code: z.string().min(4).max(6),
  purpose: z.enum(["login", "register", "reset_password"]),
});

router.post("/whatsapp/verify-otp", async (req: Request, res: Response, next: NextFunction) => {
  const parsed = whatsappVerifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }

  try {
    if (parsed.data.purpose === "login") {
      const result = await authService.loginViaWhatsapp({
        phone: parsed.data.phone,
        code: parsed.data.code,
      });
      res.cookie("auth_token", result.token, COOKIE_OPTIONS);
      return res.json({
        success: true,
        data: { user: result.user, clinic: result.clinic, token: result.token },
      });
    }

    const verified = whatsappOtpService.verifyOtp(
      parsed.data.phone,
      parsed.data.code,
      parsed.data.purpose,
    );
    res.json({
      success: true,
      data: {
        phone: verified.phone,
        verificationToken: verified.verificationToken,
      },
    });
  } catch (err) {
    next(err);
  }
});

const whatsappResetPasswordSchema = z.object({
  phone: z.string().min(10),
  verificationToken: z.string().min(16),
  newPassword: z.string().min(6),
});

router.post("/whatsapp/reset-password", async (req: Request, res: Response, next: NextFunction) => {
  const parsed = whatsappResetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }

  try {
    await authService.resetPasswordViaWhatsapp(parsed.data);
    res.json({ success: true, message: "Password has been reset successfully." });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("auth_token");
  res.json({ success: true, message: "Logged out successfully" });
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
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

router.post("/start-trial", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.startTrial(
      req.user!.userId,
      req.user!.clinicId,
      req.user!.role,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  photoUrl: z.string().nullable().optional(),
});

const requestEmailChangeSchema = z.object({
  newEmail: z.string().email(),
});

const confirmEmailChangeSchema = z.object({
  newEmail: z.string().email(),
  code: z.string().min(4).max(6),
});

router.post("/me/request-email-change", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = requestEmailChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }

  try {
    await authService.requestEmailChange(req.user!.userId, parsed.data.newEmail);
    res.json({ success: true, message: "Код подтверждения отправлен на новый email" });
  } catch (err) {
    next(err);
  }
});

router.post("/me/confirm-email-change", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = confirmEmailChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }

  try {
    const user = await authService.confirmEmailChange(
      req.user!.userId,
      parsed.data.newEmail,
      parsed.data.code,
    );
    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
});

router.patch("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.errors[0]?.message ?? "Validation failed"));
  }

  try {
    const user = await authService.updateProfile(req.user!.userId, parsed.data);
    res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
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

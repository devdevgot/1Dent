import { z } from "zod";
import i18n from "@/lib/i18n";

export const createLoginSchema = () =>
  z.object({
    email: z
      .string()
      .trim()
      .min(1, i18n.t("validation.emailInvalid"))
      .email(i18n.t("validation.emailInvalid"))
      .transform((value) => value.toLowerCase()),
    password: z.string().min(1, i18n.t("validation.passwordRequired")),
  });

export type LoginFormValues = {
  email: string;
  password: string;
};

export const createRegisterSchema = () =>
  z.object({
    clinicName: z.string().trim().min(2, i18n.t("validation.clinicNameMin")),
    name: z.string().trim().min(2, i18n.t("validation.nameMin")),
    password: z.string().min(6, i18n.t("validation.passwordMin")),
  });

export type RegisterFormValues = {
  clinicName: string;
  name: string;
  password: string;
};

export const createForgotPasswordSchema = () =>
  z.object({
    email: z
      .string()
      .trim()
      .min(1, i18n.t("validation.emailInvalid"))
      .email(i18n.t("validation.emailInvalid"))
      .transform((value) => value.toLowerCase()),
  });

export type ForgotPasswordFormValues = {
  email: string;
};

export const createResetPasswordSchema = () =>
  z
    .object({
      newPassword: z.string().min(6, i18n.t("validation.passwordMin")),
      confirmPassword: z.string().min(1, i18n.t("validation.passwordRequired")),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: i18n.t("validation.passwordsMismatch"),
      path: ["confirmPassword"],
    });

export const REGISTRATION_USE_CASES = [
  { id: "crm", labelKey: "register.useCase.crm", subKey: "register.useCase.crmSub", icon: "crm" },
  { id: "schedule", labelKey: "register.useCase.schedule", subKey: "register.useCase.scheduleSub", icon: "schedule" },
  { id: "whatsapp", labelKey: "register.useCase.whatsapp", subKey: "register.useCase.whatsappSub", icon: "whatsapp" },
  { id: "finance", labelKey: "register.useCase.finance", subKey: "register.useCase.financeSub", icon: "finance" },
  { id: "analytics", labelKey: "register.useCase.analytics", subKey: "register.useCase.analyticsSub", icon: "analytics" },
  { id: "marketing", labelKey: "register.useCase.marketing", subKey: "register.useCase.marketingSub", icon: "marketing" },
] as const;

export type RegistrationUseCaseId = (typeof REGISTRATION_USE_CASES)[number]["id"];

import { z } from "zod";
import i18n from "@/lib/i18n";

export const createLoginSchema = () =>
  z.object({
    email: z.string().email(i18n.t("validation.emailInvalid")),
    password: z.string().min(1, i18n.t("validation.passwordRequired")),
  });

export type LoginFormValues = {
  email: string;
  password: string;
};

export const createRegisterSchema = () =>
  z.object({
    clinicName: z.string().min(2, i18n.t("validation.clinicNameMin")),
    name: z.string().min(2, i18n.t("validation.nameMin")),
    email: z.string().email(i18n.t("validation.emailInvalid")),
    password: z.string().min(6, i18n.t("validation.passwordMin")),
  });

export type RegisterFormValues = {
  clinicName: string;
  name: string;
  email: string;
  password: string;
};

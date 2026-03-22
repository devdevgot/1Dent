import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z.string().min(1, "Пароль обязателен"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  clinicName: z.string().min(2, "Название клиники — минимум 2 символа"),
  name: z.string().min(2, "Имя — минимум 2 символа"),
  email: z.string().email("Введите корректный email"),
  password: z.string().min(6, "Пароль — минимум 6 символов"),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID, randomBytes } from "crypto";
import { AuthRepository } from "./auth.repository";
import type { UpdateUserData } from "./auth.repository";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../../shared/errors";
import type { UserRole, User, RegistrationUseCaseId } from "@workspace/db";
import type { SafeClinic } from "./auth.repository";
import { sendPasswordResetEmail, sendStaffInvitationEmail, sendEmailChangeCode } from "../../lib/email";
import { logger } from "../../lib/logger";
import { seedContractTemplatesForClinic } from "../../seeds/contract-templates.seed";
import { seedProcedureTemplates } from "../../seeds/procedure-templates.seed";
import { TabletService } from "../tablet/tablet.service";
import { planLimitsService } from "../../shared/plan-limits.service";
import {
  whatsappOtpService,
  buildStaffInviteWhatsAppMessage,
} from "./whatsapp-otp.service";
import { sendPlatformWhatsApp } from "../../shared/platform-whatsapp";

const resetTokens = new Map<string, { email: string; expiresAt: number }>();
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const emailChangeCodes = new Map<string, { newEmail: string; code: string; expiresAt: number }>();
const EMAIL_CHANGE_TTL_MS = 15 * 60 * 1000;

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required.");
  }
  return secret;
}

const SALT_ROUNDS = 10;

export interface AuthResult {
  user: Omit<User, "passwordHash">;
  clinic: SafeClinic;
  token: string;
}

export class AuthService {
  private repo = new AuthRepository();

  async register(data: {
    clinicName: string;
    name: string;
    email?: string;
    password: string;
    phone?: string;
    phoneVerificationToken?: string;
    useCases?: string[];
  }): Promise<AuthResult> {
    let verifiedPhone: string | null = null;
    if (data.phone && data.phoneVerificationToken) {
      verifiedPhone = whatsappOtpService.assertVerificationToken(
        data.phone,
        data.phoneVerificationToken,
        "register",
      );
      const phoneUsers = await this.repo.findUsersByPhone(verifiedPhone);
      if (phoneUsers.length > 0) {
        throw new ConflictError("Этот номер WhatsApp уже привязан к другому аккаунту");
      }
    }

    const normalizedEmail = data.email
      ? data.email.toLowerCase()
      : verifiedPhone
        ? `${verifiedPhone.replace(/\D/g, "")}@wa.1dent.internal`
        : null;

    if (!normalizedEmail) {
      throw new ValidationError("Подтвердите WhatsApp для регистрации");
    }

    const existing = await this.repo.findUserByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictError("Этот email уже зарегистрирован");
    }

    const clinic = await this.repo.createClinic({
      id: randomUUID(),
      name: data.clinicName,
      registrationUseCases: (data.useCases ?? []) as RegistrationUseCaseId[],
    });

    seedContractTemplatesForClinic(clinic.id).catch((err) => {
      logger.warn({ err, clinicId: clinic.id }, "[auth] contract template seed failed on register");
    });

    try {
      const seedResult = await seedProcedureTemplates(clinic.id);
      logger.info(
        { clinicId: clinic.id, ...seedResult },
        "[auth] procedure template seed completed on register",
      );
    } catch (err) {
      logger.warn({ err, clinicId: clinic.id }, "[auth] procedure template seed failed on register");
    }

    new TabletService().seedDefaultCabinet(clinic.id, clinic.name).catch((err) => {
      logger.warn({ err, clinicId: clinic.id }, "[auth] tablet cabinet seed failed on register");
    });

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    const user = await this.repo.createUser({
      id: randomUUID(),
      clinicId: clinic.id,
      name: data.name,
      email: normalizedEmail,
      passwordHash,
      role: "owner",
      phone: verifiedPhone,
    });

    const token = this.generateToken(user, clinic.id);
    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, clinic, token };
  }

  async login(data: { email?: string; phone?: string; password: string }): Promise<AuthResult> {
    let user: User | undefined;

    if (data.phone) {
      const matches = await this.repo.findUsersByPhone(data.phone, true);
      if (matches.length === 0) {
        throw new UnauthorizedError("Неверный номер или пароль");
      }
      if (matches.length > 1) {
        throw new ValidationError("Номер привязан к нескольким аккаунтам. Обратитесь в поддержку.");
      }
      user = matches[0];
    } else if (data.email) {
      user = await this.repo.findUserByEmailAnyStatus(data.email.toLowerCase());
    } else {
      throw new ValidationError("Укажите номер WhatsApp");
    }

    if (!user) {
      throw new UnauthorizedError("Неверный номер или пароль");
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Неверный номер или пароль");
    }

    if (user.isActive === false) {
      throw new UnauthorizedError(
        "Аккаунт деактивирован. Если вы только что восстановили клинику в админке — активируйте сотрудника или обратитесь в поддержку 1Dent.",
      );
    }

    const clinic = await this.repo.findClinicById(user.clinicId);
    if (!clinic) {
      throw new UnauthorizedError("Клиника не найдена. Обратитесь в поддержку 1Dent.");
    }
    const clinicActive = await this.repo.isClinicActive(user.clinicId);
    if (!clinicActive) {
      throw new UnauthorizedError("Клиника деактивирована. Обратитесь в поддержку 1Dent.");
    }

    const token = this.generateToken(user, user.clinicId);
    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, clinic, token };
  }

  private async resolveActiveUsersByPhone(phone: string): Promise<User[]> {
    return this.repo.findUsersByPhone(phone);
  }

  private async resolveAnyUsersByPhone(phone: string): Promise<User[]> {
    return this.repo.findUsersByPhone(phone, true);
  }

  private async assertSinglePhoneAccount(
    phone: string,
    options?: { allowInactive?: boolean; skipClinicCheck?: boolean },
  ): Promise<User> {
    const activeMatches = await this.resolveActiveUsersByPhone(phone);

    if (activeMatches.length === 1) {
      const user = activeMatches[0]!;
      if (!options?.skipClinicCheck) {
        const clinicActive = await this.repo.isClinicActive(user.clinicId);
        if (!clinicActive) {
          throw new NotFoundError("Клиника деактивирована. Обратитесь в поддержку 1Dent.");
        }
      }
      return user;
    }

    if (activeMatches.length > 1) {
      throw new ValidationError("Номер привязан к нескольким аккаунтам. Обратитесь в поддержку.");
    }

    if (options?.allowInactive) {
      const inactiveMatches = await this.resolveAnyUsersByPhone(phone);
      if (inactiveMatches.length > 0) {
        throw new NotFoundError("Аккаунт деактивирован. Обратитесь в поддержку 1Dent.");
      }
    }

    throw new NotFoundError(
      "Аккаунт с этим номером WhatsApp не найден. Проверьте номер или войдите по паролю на странице входа.",
    );
  }

  async assertPhoneAccountForPasswordReset(phone: string): Promise<void> {
    const normalized = whatsappOtpService.normalizePhone(phone);
    await this.assertSinglePhoneAccount(normalized, {
      allowInactive: true,
      skipClinicCheck: true,
    });
  }

  async assertPhoneAvailableForRegistration(phone: string): Promise<void> {
    const normalized = whatsappOtpService.normalizePhone(phone);
    const activeMatches = await this.resolveActiveUsersByPhone(normalized);
    if (activeMatches.length > 0) {
      throw new ConflictError(
        "Этот номер WhatsApp уже привязан к аккаунту. Войдите или восстановите пароль на странице входа.",
      );
    }
  }

  async resetPasswordViaWhatsapp(data: {
    phone: string;
    verificationToken: string;
    newPassword: string;
  }): Promise<void> {
    const normalized = whatsappOtpService.assertVerificationToken(
      data.phone,
      data.verificationToken,
      "reset_password",
    );
    const user = await this.assertSinglePhoneAccount(normalized, {
      allowInactive: true,
      skipClinicCheck: true,
    });

    const passwordHash = await bcrypt.hash(data.newPassword, SALT_ROUNDS);
    await this.repo.updateUserPassword(user.id, passwordHash);
  }

  async loginViaWhatsapp(data: { phone: string; code: string }): Promise<AuthResult> {
    const normalized = whatsappOtpService.consumeVerificationForLogin(data.phone, data.code);
    const user = await this.assertSinglePhoneAccount(normalized);
    const clinic = await this.repo.findClinicById(user.clinicId);
    if (!clinic) {
      throw new UnauthorizedError("Клиника не найдена. Обратитесь в поддержку 1Dent.");
    }

    const token = this.generateToken(user, user.clinicId);
    const { passwordHash: __, ...safeUser } = user;
    return { user: safeUser, clinic, token };
  }

  async getMe(
    userId: string,
    clinicId: string,
  ): Promise<{ user: Omit<User, "passwordHash">; clinic: SafeClinic }> {
    const user = await this.repo.findUserByIdAndClinic(userId, clinicId);
    if (!user) throw new NotFoundError("User not found");

    const clinic = await this.repo.findClinicById(clinicId);
    if (!clinic) throw new NotFoundError("Clinic not found");

    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, clinic };
  }

  async startTrial(
    userId: string,
    clinicId: string,
    role: UserRole,
  ): Promise<{ user: Omit<User, "passwordHash">; clinic: SafeClinic }> {
    if (role !== "owner") {
      throw new ForbiddenError("Только владелец клиники может активировать пробный период");
    }

    const clinic = await this.repo.findClinicById(clinicId);
    if (!clinic) throw new NotFoundError("Clinic not found");

    if (clinic.plan !== "free") {
      throw new ValidationError("Пробный период доступен только без активного тарифа");
    }
    if (clinic.trialEndsAt) {
      throw new ValidationError("Пробный период уже был использован");
    }

    const trialEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const updatedClinic = await this.repo.setTrialEndsAt(clinicId, trialEndsAt);
    if (!updatedClinic) throw new NotFoundError("Clinic not found");

    const user = await this.repo.findUserByIdAndClinic(userId, clinicId);
    if (!user) throw new NotFoundError("User not found");

    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, clinic: updatedClinic };
  }

  async requestPasswordReset(email: string): Promise<{ token: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.repo.findUserByEmail(normalizedEmail);
    if (!user) {
      return { token: "" };
    }

    for (const [t, data] of resetTokens.entries()) {
      if (data.email === normalizedEmail || data.expiresAt < Date.now()) {
        resetTokens.delete(t);
      }
    }

    const token = randomUUID();
    resetTokens.set(token, { email: normalizedEmail, expiresAt: Date.now() + RESET_TOKEN_TTL_MS });
    console.log(`[PasswordReset] Token for ${normalizedEmail}: ${token}`);
    
    sendPasswordResetEmail(normalizedEmail, token).catch((err) => {
      logger.error({ err, email: normalizedEmail }, "Failed to send password reset email");
    });

    return { token };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const entry = resetTokens.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      throw new UnauthorizedError("Invalid or expired reset token");
    }

    const user = await this.repo.findUserByEmail(entry.email);
    if (!user) throw new NotFoundError("User not found");

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.repo.updateUserPassword(user.id, passwordHash);
    resetTokens.delete(token);
  }

  async createUser(data: {
    clinicId: string;
    name: string;
    email: string;
    password: string;
    role: UserRole;
    requestingRole: UserRole;
    phone?: string;
    position?: string;
    specialty?: string;
    hireDate?: string;
    maxPatientsPerDay?: number;
  }): Promise<Omit<User, "passwordHash"> & { rawPassword: string }> {
    if (data.requestingRole !== "owner" && data.requestingRole !== "admin") {
      throw new ForbiddenError("Only owners and admins can create users");
    }
    if (data.role === "owner" && data.requestingRole !== "owner") {
      throw new ForbiddenError("Only owners can create other owners");
    }

    const existing = await this.repo.findUserByEmailAnyStatus(data.email.toLowerCase());
    if (existing?.isActive) {
      throw new ConflictError("Сотрудник с таким email уже существует");
    }
    if (existing && !existing.isActive) {
      throw new ConflictError(
        "Этот email принадлежит деактивированному аккаунту. Включите «Показать неактивных» в списке сотрудников или используйте другой email.",
      );
    }

    await planLimitsService.assertCanAddStaff(data.clinicId);

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    const user = await this.repo.createUser({
      id: randomUUID(),
      clinicId: data.clinicId,
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash,
      role: data.role,
      phone: data.phone ?? null,
      position: data.position ?? null,
      specialty: data.specialty ?? null,
      hireDate: data.hireDate ?? null,
    });

    const { passwordHash: _, ...safeUser } = user;
    return { ...safeUser, rawPassword: data.password };
  }

  async listUsers(clinicId: string, includeInactive = false) {
    return this.repo.listUsersWithSalary(clinicId, includeInactive);
  }

  async updateUser(
    id: string,
    clinicId: string,
    data: UpdateUserData,
    requestingRole: UserRole,
  ): Promise<Omit<User, "passwordHash">> {
    const user = await this.repo.findUserByIdAndClinic(id, clinicId);
    if (!user) throw new NotFoundError("User not found");

    if (data.role === "owner" && requestingRole !== "owner") {
      throw new ForbiddenError("Only owners can promote users to owner role");
    }
    if (user.role === "owner" && requestingRole !== "owner") {
      throw new ForbiddenError("Only owners can modify other owners");
    }

    let passwordHash: string | undefined;
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    }

    const updated = await this.repo.updateUser(id, clinicId, { ...data, passwordHash });
    if (!updated) throw new NotFoundError("User not found");

    const { passwordHash: _, ...safeUser } = updated;
    return safeUser;
  }

  async updateUserStatus(
    id: string,
    clinicId: string,
    isActive: boolean,
    requestingRole: UserRole,
  ): Promise<Omit<User, "passwordHash">> {
    const user = await this.repo.findUserByIdAndClinic(id, clinicId);
    if (!user) throw new NotFoundError("User not found");

    if (user.role === "owner") {
      throw new ForbiddenError("Cannot deactivate the owner account");
    }
    if (requestingRole !== "owner" && requestingRole !== "admin") {
      throw new ForbiddenError("Only owners and admins can change user status");
    }

    const updated = await this.repo.updateUserStatus(id, clinicId, isActive);
    if (!updated) throw new NotFoundError("User not found");

    const { passwordHash: _, ...safeUser } = updated;
    return safeUser;
  }

  async deleteUser(id: string, clinicId: string, requestingRole: UserRole): Promise<void> {
    const user = await this.repo.findUserByIdAndClinic(id, clinicId);
    if (!user) throw new NotFoundError("User not found");
    if (user.role === "owner" && requestingRole !== "owner") {
      throw new ForbiddenError("Only owners can delete other owners");
    }
    await this.repo.deleteUser(id, clinicId);
  }

  async inviteUser(data: {
    clinicId: string;
    name: string;
    email: string;
    role: UserRole;
    requestingRole: UserRole;
    phone?: string;
    position?: string;
    specialty?: string;
    hireDate?: string;
  }): Promise<{ userId: string; tempPassword: string; clinicName: string }> {
    if (data.requestingRole !== "owner" && data.requestingRole !== "admin") {
      throw new ForbiddenError("Only owners and admins can invite users");
    }
    if (data.role === "owner") {
      throw new ForbiddenError("Cannot invite users with owner role");
    }
    if (!data.phone?.trim()) {
      throw new ValidationError("Укажите номер WhatsApp сотрудника");
    }

    const normalizedPhone = whatsappOtpService.normalizePhone(data.phone);
    const emailLower = data.email.toLowerCase();
    const existingByEmail = await this.repo.findUserByEmailAnyStatus(emailLower);
    const phoneUsers = await this.repo.findUsersByPhone(normalizedPhone, true);

    if (
      existingByEmail &&
      existingByEmail.clinicId === data.clinicId &&
      existingByEmail.isActive === false
    ) {
      const phoneConflict = phoneUsers.find(
        (u) => u.isActive && u.id !== existingByEmail.id,
      );
      if (phoneConflict) {
        throw new ConflictError("Сотрудник с этим номером WhatsApp уже существует");
      }

      await planLimitsService.assertCanAddStaff(data.clinicId);

      const tempPassword = randomBytes(5).toString("hex").slice(0, 8).toUpperCase();
      const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

      const updated = await this.repo.updateUser(existingByEmail.id, data.clinicId, {
        name: data.name,
        role: data.role,
        phone: normalizedPhone,
        position: data.position ?? null,
        specialty: data.specialty ?? null,
        hireDate: data.hireDate ?? null,
        isActive: true,
        passwordHash,
      });
      if (!updated) throw new NotFoundError("User not found");

      const clinic = await this.repo.findClinicById(data.clinicId);
      const clinicName = clinic?.name ?? "1Dent";
      const loginUrl = process.env["FRONTEND_URL"] ?? "https://app.1dent.kz";

      const waMessage = buildStaffInviteWhatsAppMessage(data.name, clinicName, tempPassword, loginUrl);
      sendPlatformWhatsApp(normalizedPhone, waMessage).catch((err) => {
        logger.error({ err, phone: normalizedPhone.slice(0, 5) + "***" }, "Failed to send staff invite via WhatsApp");
      });

      sendStaffInvitationEmail(data.email, data.name, tempPassword, clinicName).catch((err) => {
        logger.error({ err, email: data.email }, "Failed to send staff invitation email (fallback)");
      });

      return { userId: updated.id, tempPassword, clinicName };
    }

    const activePhoneUsers = phoneUsers.filter((u) => u.isActive);
    if (activePhoneUsers.length > 0) {
      throw new ConflictError("Сотрудник с этим номером WhatsApp уже существует");
    }

    if (existingByEmail?.isActive) {
      throw new ConflictError("Сотрудник с таким email уже существует");
    }

    if (existingByEmail && !existingByEmail.isActive) {
      throw new ConflictError(
        "Этот email принадлежит деактивированному аккаунту в другой клинике. Используйте другой email.",
      );
    }

    await planLimitsService.assertCanAddStaff(data.clinicId);

    const tempPassword = randomBytes(5).toString("hex").slice(0, 8).toUpperCase();
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

    const user = await this.repo.createUser({
      id: randomUUID(),
      clinicId: data.clinicId,
      name: data.name,
      email: emailLower,
      passwordHash,
      role: data.role,
      phone: normalizedPhone,
      position: data.position ?? null,
      specialty: data.specialty ?? null,
      hireDate: data.hireDate ?? null,
    });

    const clinic = await this.repo.findClinicById(data.clinicId);
    const clinicName = clinic?.name ?? "1Dent";
    const loginUrl = process.env["FRONTEND_URL"] ?? "https://app.1dent.kz";

    const waMessage = buildStaffInviteWhatsAppMessage(data.name, clinicName, tempPassword, loginUrl);
    sendPlatformWhatsApp(normalizedPhone, waMessage).catch((err) => {
      logger.error({ err, phone: normalizedPhone.slice(0, 5) + "***" }, "Failed to send staff invite via WhatsApp");
    });

    sendStaffInvitationEmail(data.email, data.name, tempPassword, clinicName).catch((err) => {
      logger.error({ err, email: data.email }, "Failed to send staff invitation email (fallback)");
    });

    return { userId: user.id, tempPassword, clinicName };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.repo.findUserById(userId);
    if (!user) throw new NotFoundError("User not found");

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new ValidationError("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.repo.updateUserPassword(userId, passwordHash);
  }

  async requestEmailChange(userId: string, newEmail: string): Promise<void> {
    const normalized = newEmail.trim().toLowerCase();
    const user = await this.repo.findUserById(userId);
    if (!user) throw new NotFoundError("User not found");

    if (normalized === user.email.toLowerCase()) {
      throw new ValidationError("Это уже ваш текущий email");
    }

    const existing = await this.repo.findUserByEmail(normalized);
    if (existing && existing.id !== userId) {
      throw new ConflictError("Этот email уже зарегистрирован");
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    emailChangeCodes.set(userId, {
      newEmail: normalized,
      code,
      expiresAt: Date.now() + EMAIL_CHANGE_TTL_MS,
    });

    const sent = await sendEmailChangeCode(normalized, code);
    if (!sent) {
      emailChangeCodes.delete(userId);
      throw new ValidationError("Не удалось отправить код подтверждения");
    }

    if (process.env["NODE_ENV"] !== "production") {
      console.log(`[EmailChange] Code for ${normalized}: ${code}`);
    }
  }

  async confirmEmailChange(
    userId: string,
    newEmail: string,
    code: string,
  ): Promise<Omit<User, "passwordHash">> {
    const normalized = newEmail.trim().toLowerCase();
    const entry = emailChangeCodes.get(userId);

    if (!entry || entry.expiresAt < Date.now()) {
      emailChangeCodes.delete(userId);
      throw new UnauthorizedError("Код истёк или не найден. Запросите новый код.");
    }

    if (entry.newEmail !== normalized || entry.code !== code.trim()) {
      throw new UnauthorizedError("Неверный код подтверждения");
    }

    const existing = await this.repo.findUserByEmail(normalized);
    if (existing && existing.id !== userId) {
      throw new ConflictError("Этот email уже зарегистрирован");
    }

    emailChangeCodes.delete(userId);
    const updated = await this.repo.updateUserProfile(userId, { email: normalized });
    if (!updated) throw new NotFoundError("User not found");

    const { passwordHash: _, ...safeUser } = updated;
    return safeUser;
  }

  async updateProfile(
    userId: string,
    data: { name?: string; email?: string; photoUrl?: string | null },
  ): Promise<Omit<User, "passwordHash">> {
    if (data.email) {
      throw new ValidationError("Для смены email используйте подтверждение по коду");
    }

    const updated = await this.repo.updateUserProfile(userId, data);
    if (!updated) throw new NotFoundError("User not found");

    const { passwordHash: _, ...safeUser } = updated;
    return safeUser;
  }

  private generateToken(user: User, clinicId: string): string {
    return jwt.sign(
      {
        userId: user.id,
        clinicId,
        role: user.role,
        email: user.email,
      },
      getJwtSecret(),
      { expiresIn: "30d" },
    );
  }
}

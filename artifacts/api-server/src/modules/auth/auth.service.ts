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
import type { UserRole, User } from "@workspace/db";
import type { SafeClinic } from "./auth.repository";
import { sendPasswordResetEmail, sendStaffInvitationEmail, sendEmailChangeCode } from "../../lib/email";
import { logger } from "../../lib/logger";
import { seedContractTemplatesForClinic } from "../../seeds/contract-templates.seed";
import { seedProcedureTemplates } from "../../seeds/procedure-templates.seed";
import { TabletService } from "../tablet/tablet.service";
import { planLimitsService } from "../../shared/plan-limits.service";

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
    email: string;
    password: string;
  }): Promise<AuthResult> {
    const normalizedEmail = data.email.toLowerCase();
    const existing = await this.repo.findUserByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictError("Этот email уже зарегистрирован");
    }

    const clinic = await this.repo.createClinic({
      id: randomUUID(),
      name: data.clinicName,
    });

    seedContractTemplatesForClinic(clinic.id).catch((err) => {
      logger.warn({ err, clinicId: clinic.id }, "[auth] contract template seed failed on register");
    });

    seedProcedureTemplates(clinic.id).catch((err) => {
      logger.warn({ err, clinicId: clinic.id }, "[auth] procedure template seed failed on register");
    });

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
    });

    const token = this.generateToken(user, clinic.id);
    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, clinic, token };
  }

  async login(data: { email: string; password: string }): Promise<AuthResult> {
    const user = await this.repo.findUserByEmail(data.email.toLowerCase());
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (user.isActive === false) {
      throw new UnauthorizedError("Account is deactivated");
    }

    const clinic = await this.repo.findClinicById(user.clinicId);
    if (!clinic) {
      throw new UnauthorizedError("Clinic not found");
    }

    const token = this.generateToken(user, user.clinicId);
    const { passwordHash: _, ...safeUser } = user;
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
    const user = await this.repo.findUserByEmail(email);
    if (!user) {
      return { token: "" };
    }

    for (const [t, data] of resetTokens.entries()) {
      if (data.email === email || data.expiresAt < Date.now()) {
        resetTokens.delete(t);
      }
    }

    const token = randomUUID();
    resetTokens.set(token, { email, expiresAt: Date.now() + RESET_TOKEN_TTL_MS });
    console.log(`[PasswordReset] Token for ${email}: ${token}`);
    
    sendPasswordResetEmail(email, token).catch((err) => {
      logger.error({ err, email }, "Failed to send password reset email");
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

    const existing = await this.repo.findUserByEmail(data.email.toLowerCase());
    if (existing) throw new ConflictError("Email already in use");

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

    const existing = await this.repo.findUserByEmail(data.email.toLowerCase());
    if (existing) throw new ConflictError("Email already in use");

    await planLimitsService.assertCanAddStaff(data.clinicId);

    const tempPassword = randomBytes(5).toString("hex").slice(0, 8).toUpperCase();
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

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

    const clinic = await this.repo.findClinicById(data.clinicId);
    const clinicName = clinic?.name ?? "1Dent";

    console.log(
      `[Invite] Staff invitation for ${data.email}:\n` +
      `  Clinic: ${clinicName}\n` +
      `  Name: ${data.name}\n` +
      `  Temp password: ${tempPassword}\n` +
      `  Login URL: ${process.env["FRONTEND_URL"] ?? "https://app.1dent.kz"}\n` +
      `  Instruction: Please change your password after first login.`,
    );

    sendStaffInvitationEmail(data.email, data.name, tempPassword, clinicName).catch((err) => {
      logger.error({ err, email: data.email }, "Failed to send staff invitation email");
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

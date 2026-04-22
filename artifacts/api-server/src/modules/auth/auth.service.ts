import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
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

const resetTokens = new Map<string, { email: string; expiresAt: number }>();
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

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
    const existing = await this.repo.findUserByEmail(data.email);
    if (existing) {
      throw new ConflictError("Email already in use");
    }

    const clinic = await this.repo.createClinic({
      id: randomUUID(),
      name: data.clinicName,
    });

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    const user = await this.repo.createUser({
      id: randomUUID(),
      clinicId: clinic.id,
      name: data.name,
      email: data.email,
      passwordHash,
      role: "owner",
    });

    const token = this.generateToken(user, clinic.id);
    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, clinic, token };
  }

  async login(data: { email: string; password: string }): Promise<AuthResult> {
    const user = await this.repo.findUserByEmail(data.email);
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

    const existing = await this.repo.findUserByEmail(data.email);
    if (existing) throw new ConflictError("Email already in use");

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    const user = await this.repo.createUser({
      id: randomUUID(),
      clinicId: data.clinicId,
      name: data.name,
      email: data.email,
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

  async updateProfile(
    userId: string,
    data: { name?: string; email?: string; photoUrl?: string | null },
  ): Promise<Omit<User, "passwordHash">> {
    if (data.email) {
      const existing = await this.repo.findUserByEmail(data.email);
      if (existing && existing.id !== userId) {
        throw new ConflictError("Email already in use");
      }
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

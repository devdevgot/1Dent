import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { AuthRepository } from "./auth.repository";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  ForbiddenError,
} from "../../shared/errors";
import type { UserRole, User, Clinic } from "@workspace/db";

// In-memory password reset token store: token → { email, expiresAt }
const resetTokens = new Map<string, { email: string; expiresAt: number }>();
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

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
  clinic: Clinic;
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
  ): Promise<{ user: Omit<User, "passwordHash">; clinic: Clinic }> {
    const user = await this.repo.findUserByIdAndClinic(userId, clinicId);
    if (!user) throw new NotFoundError("User not found");

    const clinic = await this.repo.findClinicById(clinicId);
    if (!clinic) throw new NotFoundError("Clinic not found");

    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, clinic };
  }

  async requestPasswordReset(email: string): Promise<{ token: string }> {
    const user = await this.repo.findUserByEmail(email);
    // Always return success to avoid email enumeration (but only generate token if user exists)
    if (!user) {
      // Return a fake token so the response is always the same shape
      return { token: "" };
    }

    // Clean up expired tokens for this email
    for (const [t, data] of resetTokens.entries()) {
      if (data.email === email || data.expiresAt < Date.now()) {
        resetTokens.delete(t);
      }
    }

    const token = randomUUID();
    resetTokens.set(token, { email, expiresAt: Date.now() + RESET_TOKEN_TTL_MS });

    // In production, send via email. For now, log it.
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

    // Invalidate the token after use
    resetTokens.delete(token);
  }

  async createUser(data: {
    clinicId: string;
    name: string;
    email: string;
    password: string;
    role: UserRole;
    requestingRole: UserRole;
  }): Promise<Omit<User, "passwordHash">> {
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
    });

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  async listUsers(clinicId: string): Promise<Omit<User, "passwordHash">[]> {
    const users = await this.repo.listUsersByClinic(clinicId);
    return users.map(({ passwordHash: _, ...u }) => u);
  }

  async updateUser(
    id: string,
    clinicId: string,
    data: Partial<Pick<User, "name" | "role">>,
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

    const updated = await this.repo.updateUser(id, clinicId, data);
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

  private generateToken(user: User, clinicId: string): string {
    return jwt.sign(
      {
        userId: user.id,
        clinicId,
        role: user.role,
        email: user.email,
      },
      getJwtSecret(),
      { expiresIn: "7d" },
    );
  }
}

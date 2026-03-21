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

const JWT_SECRET = process.env["JWT_SECRET"] || "dental-crm-secret-change-in-production";
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

  async getMe(userId: string): Promise<{ user: Omit<User, "passwordHash">; clinic: Clinic }> {
    const user = await this.repo.findUserById(userId);
    if (!user) throw new NotFoundError("User not found");

    const clinic = await this.repo.findClinicById(user.clinicId);
    if (!clinic) throw new NotFoundError("Clinic not found");

    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, clinic };
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
  ): Promise<Omit<User, "passwordHash">> {
    const user = await this.repo.findUserById(id);
    if (!user || user.clinicId !== clinicId) throw new NotFoundError("User not found");

    const updated = await this.repo.updateUser(id, data);
    if (!updated) throw new NotFoundError("User not found");

    const { passwordHash: _, ...safeUser } = updated;
    return safeUser;
  }

  async deleteUser(id: string, clinicId: string): Promise<void> {
    const user = await this.repo.findUserById(id);
    if (!user || user.clinicId !== clinicId) throw new NotFoundError("User not found");
    await this.repo.deleteUser(id);
  }

  private generateToken(user: User, clinicId: string): string {
    return jwt.sign(
      {
        userId: user.id,
        clinicId,
        role: user.role,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
  }
}

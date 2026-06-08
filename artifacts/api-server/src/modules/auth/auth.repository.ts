import { db, usersTable, clinicsTable, userSalarySettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { InsertUser, InsertClinic, User, Clinic } from "@workspace/db";

export type SafeClinic = Omit<Clinic, "greenApiInstanceId" | "greenApiToken">;

export type UpdateUserData = Partial<
  Pick<User, "name" | "role" | "phone" | "position" | "specialty" | "hireDate" | "isActive" | "photoUrl">
> & { password?: string; passwordHash?: string };

export class AuthRepository {
  async findUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.email, email.toLowerCase()), eq(usersTable.isActive, true)))
      .limit(1);
    return user as any;
  }

  async findUserById(id: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    return user as any;
  }

  async findUserByIdAndClinic(id: string, clinicId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.clinicId, clinicId)))
      .limit(1);
    return user as any;
  }

  async findClinicById(id: string): Promise<SafeClinic | undefined> {
    const [clinic] = await db
      .select({
        id: clinicsTable.id,
        name: clinicsTable.name,
        plan: clinicsTable.plan,
        whatsappPhone: clinicsTable.whatsappPhone,
        trialEndsAt: clinicsTable.trialEndsAt,
        planExpiresAt: clinicsTable.planExpiresAt,
        createdAt: clinicsTable.createdAt,
      })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, id))
      .limit(1);
    return clinic as any;
  }

  async createClinic(data: InsertClinic): Promise<Clinic> {
    const [clinic] = await db.insert(clinicsTable).values(data).returning();
    return clinic!;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(usersTable).values(data).returning();
    return user as any;
  }

  async listUsersByClinic(clinicId: string, includeInactive = false): Promise<User[]> {
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clinicId, clinicId));
    if (includeInactive) return rows;
    return rows.filter((u) => u.isActive !== false);
  }

  async listUsersWithSalary(clinicId: string, includeInactive = false) {
    const users = await this.listUsersByClinic(clinicId, includeInactive);
    const salaryRows = await db
      .select()
      .from(userSalarySettingsTable)
      .where(eq(userSalarySettingsTable.clinicId, clinicId));

    const salaryMap = new Map(salaryRows.map((s) => [s.userId, s]));

    return users.map((u) => {
      const { passwordHash: _, ...safe } = u;
      return { ...safe, salarySettings: salaryMap.get(u.id) ?? null };
    });
  }

  async updateUser(
    id: string,
    clinicId: string,
    data: UpdateUserData,
  ): Promise<User | undefined> {
    const { password: _pw, passwordHash, ...rest } = data;
    const setData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (passwordHash) setData["passwordHash"] = passwordHash;

    const [user] = await db
      .update(usersTable)
      .set(setData)
      .where(and(eq(usersTable.id, id), eq(usersTable.clinicId, clinicId)))
      .returning();
    return user as any;
  }

  async updateUserStatus(id: string, clinicId: string, isActive: boolean): Promise<User | undefined> {
    const [user] = await db
      .update(usersTable)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(usersTable.id, id), eq(usersTable.clinicId, clinicId)))
      .returning();
    return user as any;
  }

  async deleteUser(id: string, clinicId: string): Promise<void> {
    await db
      .delete(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.clinicId, clinicId)));
  }

  async updateUserPassword(id: string, passwordHash: string): Promise<void> {
    await db
      .update(usersTable)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(usersTable.id, id));
  }

  async updateUserProfile(
    id: string,
    data: Partial<Pick<User, "name" | "email" | "photoUrl">>,
  ): Promise<User | undefined> {
    const [user] = await db
      .update(usersTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning();
    return user as any;
  }
}

import { db, usersTable, clinicsTable, userSalarySettingsTable, doctorCapacityTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { InsertUser, InsertClinic, User, Clinic } from "@workspace/db";
import { phonesMatch, syntheticWhatsappEmail } from "../../shared/phone";

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

  async findUserByEmailAnyStatus(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);
    return user as any;
  }

  async findUsersByPhone(phone: string, includeInactive = false): Promise<User[]> {
    const rows = includeInactive
      ? await db.select().from(usersTable)
      : await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.isActive, true));

    const byPhone = rows.filter((u) => u.phone && phonesMatch(u.phone, phone)) as User[];
    if (byPhone.length > 0) return byPhone;

    let syntheticEmail: string;
    try {
      syntheticEmail = syntheticWhatsappEmail(phone);
    } catch {
      return [];
    }

    const bySyntheticEmail = rows.filter(
      (u) => u.email.toLowerCase() === syntheticEmail,
    ) as User[];
    return bySyntheticEmail;
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

  async isClinicActive(id: string): Promise<boolean> {
    const [row] = await db
      .select({ isActive: clinicsTable.isActive })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, id))
      .limit(1);
    return row?.isActive ?? false;
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
    const conditions = [eq(usersTable.clinicId, clinicId)];
    if (!includeInactive) {
      conditions.push(eq(usersTable.isActive, true));
    }

    return db
      .select({
        id: usersTable.id,
        clinicId: usersTable.clinicId,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        photoUrl: usersTable.photoUrl,
        phone: usersTable.phone,
        position: usersTable.position,
        specialty: usersTable.specialty,
        hireDate: usersTable.hireDate,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable)
      .where(and(...conditions)) as unknown as Promise<User[]>;
  }

  async listUsersWithSalary(clinicId: string, includeInactive = false) {
    // Run all three queries in parallel — they are independent.
    const [users, salaryRows, capacityRows] = await Promise.all([
      this.listUsersByClinic(clinicId, includeInactive),
      db
        .select()
        .from(userSalarySettingsTable)
        .where(eq(userSalarySettingsTable.clinicId, clinicId)),
      db
        .select()
        .from(doctorCapacityTable)
        .where(eq(doctorCapacityTable.clinicId, clinicId)),
    ]);

    const salaryMap = new Map(salaryRows.map((s) => [s.userId, s]));
    const capacityMap = new Map(capacityRows.map((c) => [c.doctorId, c.maxPatientsPerDay]));

    return users.map((u) => ({
      ...u,
      salarySettings: salaryMap.get(u.id) ?? null,
      maxPatientsPerDay: u.role === "doctor" ? (capacityMap.get(u.id) ?? 20) : null,
    }));
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

  async setTrialEndsAt(clinicId: string, trialEndsAt: Date): Promise<SafeClinic | undefined> {
    const [clinic] = await db
      .update(clinicsTable)
      .set({ trialEndsAt })
      .where(eq(clinicsTable.id, clinicId))
      .returning({
        id: clinicsTable.id,
        name: clinicsTable.name,
        plan: clinicsTable.plan,
        whatsappPhone: clinicsTable.whatsappPhone,
        trialEndsAt: clinicsTable.trialEndsAt,
        planExpiresAt: clinicsTable.planExpiresAt,
        createdAt: clinicsTable.createdAt,
      });
    return clinic as SafeClinic | undefined;
  }
}

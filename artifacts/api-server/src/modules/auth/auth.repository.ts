import { db, usersTable, clinicsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { InsertUser, InsertClinic, User, Clinic } from "@workspace/db";

export type SafeClinic = Omit<Clinic, "greenApiInstanceId" | "greenApiToken">;

export class AuthRepository {
  async findUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    return user;
  }

  async findUserById(id: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    return user;
  }

  async findUserByIdAndClinic(id: string, clinicId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.clinicId, clinicId)))
      .limit(1);
    return user;
  }

  async findClinicById(id: string): Promise<SafeClinic | undefined> {
    const [clinic] = await db
      .select({
        id: clinicsTable.id,
        name: clinicsTable.name,
        plan: clinicsTable.plan,
        whatsappPhone: clinicsTable.whatsappPhone,
        createdAt: clinicsTable.createdAt,
        // Intentionally omit greenApiInstanceId and greenApiToken:
        // those are internal integration secrets and must never be
        // included in auth responses sent to non-owner clients.
      })
      .from(clinicsTable)
      .where(eq(clinicsTable.id, id))
      .limit(1);
    return clinic;
  }

  async createClinic(data: InsertClinic): Promise<Clinic> {
    const [clinic] = await db.insert(clinicsTable).values(data).returning();
    return clinic!;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(usersTable).values(data).returning();
    return user!;
  }

  async listUsersByClinic(clinicId: string): Promise<User[]> {
    return db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clinicId, clinicId));
  }

  async updateUser(
    id: string,
    clinicId: string,
    data: Partial<Pick<User, "name" | "role">>,
  ): Promise<User | undefined> {
    const [user] = await db
      .update(usersTable)
      .set(data)
      .where(and(eq(usersTable.id, id), eq(usersTable.clinicId, clinicId)))
      .returning();
    return user;
  }

  async deleteUser(id: string, clinicId: string): Promise<void> {
    await db
      .delete(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.clinicId, clinicId)));
  }

  async updateUserPassword(id: string, passwordHash: string): Promise<void> {
    await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, id));
  }

  async updateUserProfile(
    id: string,
    data: Partial<Pick<User, "name" | "email" | "photoUrl">>,
  ): Promise<User | undefined> {
    const [user] = await db
      .update(usersTable)
      .set(data)
      .where(eq(usersTable.id, id))
      .returning();
    return user;
  }
}

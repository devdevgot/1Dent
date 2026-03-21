import { db, usersTable, clinicsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { InsertUser, InsertClinic, User, Clinic } from "@workspace/db";

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

  async findClinicById(id: string): Promise<Clinic | undefined> {
    const [clinic] = await db
      .select()
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

  async updateUser(id: string, data: Partial<Pick<User, "name" | "role">>): Promise<User | undefined> {
    const [user] = await db
      .update(usersTable)
      .set(data)
      .where(eq(usersTable.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(usersTable).where(eq(usersTable.id, id));
  }
}

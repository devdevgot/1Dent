import { eq, and, desc, gt, inArray } from "drizzle-orm";
import { db, tabletCabinetsTable, tabletSessionsTable, usersTable, type UserRole } from "@workspace/db";
import type { TabletCabinet, TabletSession } from "@workspace/db";

const TABLET_UNLOCK_ROLES: UserRole[] = ["doctor", "owner", "admin", "assistant", "nurse"];

export class TabletRepository {
  async findCabinetById(id: string): Promise<TabletCabinet | null> {
    const [row] = await db.select().from(tabletCabinetsTable).where(eq(tabletCabinetsTable.id, id)).limit(1);
    return row ?? null;
  }

  async findCabinetByPairingCode(code: string): Promise<TabletCabinet | null> {
    const [row] = await db
      .select()
      .from(tabletCabinetsTable)
      .where(eq(tabletCabinetsTable.pairingCode, code))
      .limit(1);
    return row ?? null;
  }

  async listCabinets(clinicId: string): Promise<TabletCabinet[]> {
    return db
      .select()
      .from(tabletCabinetsTable)
      .where(eq(tabletCabinetsTable.clinicId, clinicId))
      .orderBy(tabletCabinetsTable.name);
  }

  async createCabinet(data: {
    id: string;
    clinicId: string;
    name: string;
    pinHash?: string | null;
    pairingCode?: string | null;
  }): Promise<TabletCabinet> {
    const [row] = await db
      .insert(tabletCabinetsTable)
      .values({
        id: data.id,
        clinicId: data.clinicId,
        name: data.name,
        pinHash: data.pinHash ?? null,
        pairingCode: data.pairingCode ?? null,
      })
      .returning();
    return row!;
  }

  async findDefaultCabinet(clinicId: string): Promise<TabletCabinet | null> {
    const [row] = await db
      .select()
      .from(tabletCabinetsTable)
      .where(eq(tabletCabinetsTable.clinicId, clinicId))
      .orderBy(tabletCabinetsTable.createdAt)
      .limit(1);
    return row ?? null;
  }

  async createSession(data: {
    id: string;
    cabinetId?: string | null;
    clinicId?: string | null;
    linkTokenHash: string;
    expiresAt: Date;
  }): Promise<TabletSession> {
    const [row] = await db
      .insert(tabletSessionsTable)
      .values({
        id: data.id,
        cabinetId: data.cabinetId ?? null,
        clinicId: data.clinicId ?? null,
        linkTokenHash: data.linkTokenHash,
        expiresAt: data.expiresAt,
        status: "pending",
      })
      .returning();
    return row!;
  }

  async createBootstrapSession(data: {
    id: string;
    linkTokenHash: string;
    expiresAt: Date;
  }): Promise<TabletSession> {
    return this.createSession({
      id: data.id,
      cabinetId: null,
      clinicId: null,
      linkTokenHash: data.linkTokenHash,
      expiresAt: data.expiresAt,
    });
  }

  async assignSessionForPairing(
    sessionId: string,
    cabinetId: string,
    clinicId: string,
    doctorUserId: string,
  ): Promise<TabletSession | null> {
    const now = new Date();
    const [row] = await db
      .update(tabletSessionsTable)
      .set({
        cabinetId,
        clinicId,
        doctorUserId,
        status: "awaiting_pairing",
      })
      .where(
        and(
          eq(tabletSessionsTable.id, sessionId),
          eq(tabletSessionsTable.status, "pending"),
          gt(tabletSessionsTable.expiresAt, now),
        ),
      )
      .returning();
    return row ?? null;
  }

  async confirmPairingSession(sessionId: string, cabinetId: string): Promise<TabletSession | null> {
    const now = new Date();
    const [row] = await db
      .update(tabletSessionsTable)
      .set({
        status: "unlocked",
        unlockedAt: now,
      })
      .where(
        and(
          eq(tabletSessionsTable.id, sessionId),
          eq(tabletSessionsTable.cabinetId, cabinetId),
          eq(tabletSessionsTable.status, "awaiting_pairing"),
          gt(tabletSessionsTable.expiresAt, now),
        ),
      )
      .returning();
    return row ?? null;
  }

  async findSessionById(id: string): Promise<TabletSession | null> {
    const [row] = await db.select().from(tabletSessionsTable).where(eq(tabletSessionsTable.id, id)).limit(1);
    return row ?? null;
  }

  async findPendingSessionByTokenHash(hash: string): Promise<TabletSession | null> {
    const now = new Date();
    const [row] = await db
      .select()
      .from(tabletSessionsTable)
      .where(
        and(
          eq(tabletSessionsTable.linkTokenHash, hash),
          eq(tabletSessionsTable.status, "pending"),
          gt(tabletSessionsTable.expiresAt, now),
        ),
      )
      .orderBy(desc(tabletSessionsTable.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** Lookup by token hash regardless of status (for idempotent redeem / retries). */
  async findSessionByTokenHash(hash: string): Promise<TabletSession | null> {
    const [row] = await db
      .select()
      .from(tabletSessionsTable)
      .where(eq(tabletSessionsTable.linkTokenHash, hash))
      .orderBy(desc(tabletSessionsTable.createdAt))
      .limit(1);
    return row ?? null;
  }

  async unlockSession(sessionId: string, doctorUserId: string): Promise<TabletSession | null> {
    const now = new Date();
    const [row] = await db
      .update(tabletSessionsTable)
      .set({
        status: "unlocked",
        doctorUserId,
        unlockedAt: now,
      })
      .where(
        and(
          eq(tabletSessionsTable.id, sessionId),
          eq(tabletSessionsTable.status, "pending"),
          gt(tabletSessionsTable.expiresAt, now),
        ),
      )
      .returning();
    return row ?? null;
  }

  async releaseSession(sessionId: string): Promise<TabletSession | null> {
    const now = new Date();
    const [row] = await db
      .update(tabletSessionsTable)
      .set({ status: "released" })
      .where(
        and(
          eq(tabletSessionsTable.id, sessionId),
          inArray(tabletSessionsTable.status, ["pending", "awaiting_pairing"]),
          gt(tabletSessionsTable.expiresAt, now),
        ),
      )
      .returning();
    return row ?? null;
  }

  async expireSession(sessionId: string): Promise<void> {
    await db
      .update(tabletSessionsTable)
      .set({ status: "expired" })
      .where(eq(tabletSessionsTable.id, sessionId));
  }

  async expirePendingSessionsForCabinet(cabinetId: string): Promise<void> {
    await db
      .update(tabletSessionsTable)
      .set({ status: "expired" })
      .where(
        and(
          eq(tabletSessionsTable.cabinetId, cabinetId),
          inArray(tabletSessionsTable.status, ["pending", "awaiting_pairing"]),
        ),
      );
  }

  async listTabletUsersWithPins(clinicId: string) {
    return db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        role: usersTable.role,
        specialty: usersTable.specialty,
        photoUrl: usersTable.photoUrl,
        tabletPinHash: usersTable.tabletPinHash,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.clinicId, clinicId),
          inArray(usersTable.role, TABLET_UNLOCK_ROLES),
        ),
      );
  }

  async findClinicOwner(clinicId: string) {
    const [row] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        clinicId: usersTable.clinicId,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.clinicId, clinicId),
          eq(usersTable.role, "owner"),
          eq(usersTable.isActive, true),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findAwaitingPairingForClinic(clinicId: string) {
    const now = new Date();
    const [row] = await db
      .select()
      .from(tabletSessionsTable)
      .where(
        and(
          eq(tabletSessionsTable.clinicId, clinicId),
          eq(tabletSessionsTable.status, "awaiting_pairing"),
          gt(tabletSessionsTable.expiresAt, now),
        ),
      )
      .orderBy(desc(tabletSessionsTable.createdAt))
      .limit(1);
    return row ?? null;
  }

  async getDoctorPublic(userId: string) {
    const [row] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        role: usersTable.role,
        specialty: usersTable.specialty,
        photoUrl: usersTable.photoUrl,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    return row ?? null;
  }

  async getUserTabletPinHash(userId: string): Promise<string | null> {
    const [row] = await db
      .select({ tabletPinHash: usersTable.tabletPinHash })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    return row?.tabletPinHash ?? null;
  }

  async setUserTabletPinHash(userId: string, pinHash: string): Promise<void> {
    await db
      .update(usersTable)
      .set({ tabletPinHash: pinHash, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
  }

  async updatePairingCode(cabinetId: string, pairingCode: string): Promise<TabletCabinet | null> {
    const [row] = await db
      .update(tabletCabinetsTable)
      .set({ pairingCode, updatedAt: new Date() })
      .where(eq(tabletCabinetsTable.id, cabinetId))
      .returning();
    return row ?? null;
  }
}

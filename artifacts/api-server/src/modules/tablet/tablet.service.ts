import bcrypt from "bcryptjs";
import { randomUUID, randomBytes, createHash } from "crypto";
import { TabletRepository } from "./tablet.repository";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  TabletPinSetupRequiredError,
  TabletPinRequiredError,
  TabletPinInvalidError,
} from "../../shared/errors";
import { getPublicAppBaseUrl } from "../../shared/public-url";
import type { UserRole } from "@workspace/db";

const SALT_ROUNDS = 10;
const SESSION_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CABINET_PIN = "1234";

const ROLE_COLORS: Record<string, string> = {
  doctor: "#1f75fe",
  owner: "#7c3aed",
  admin: "#0ea5e9",
};

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateLinkToken(): { raw: string; hash: string } {
  const raw = randomBytes(24).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

function assertTabletRole(role: UserRole) {
  if (role !== "doctor" && role !== "owner" && role !== "admin") {
    throw new ForbiddenError("Только врач или владелец может войти в планшетный кабинет");
  }
}

function validatePin(pin: string) {
  if (!/^\d{4}$/.test(pin)) {
    throw new ValidationError("PIN должен состоять из 4 цифр");
  }
}

function generatePairingCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export class TabletService {
  private repo = new TabletRepository();

  async seedDefaultCabinet(clinicId: string, clinicName: string) {
    const existing = await this.repo.findDefaultCabinet(clinicId);
    if (existing) return existing;

    const pinHash = await bcrypt.hash(DEFAULT_CABINET_PIN, SALT_ROUNDS);
    return this.repo.createCabinet({
      id: randomUUID(),
      clinicId,
      name: `${clinicName} · Кабинет 1`,
      pinHash,
      pairingCode: generatePairingCode(),
    });
  }

  async listCabinets(clinicId: string) {
    let cabinets = await this.repo.listCabinets(clinicId);
    if (cabinets.length === 0) {
      await this.seedDefaultCabinet(clinicId, "Клиника");
      cabinets = await this.repo.listCabinets(clinicId);
    }
    const base = getPublicAppBaseUrl();
    return cabinets.map((c) => ({
      id: c.id,
      name: c.name,
      clinicId: c.clinicId,
      pairingCode: c.pairingCode,
      tabletUrl: `${base}/tablet?cabinet=${c.id}`,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async resolveCabinetByPairingCode(code: string) {
    const normalized = code.replace(/\D/g, "");
    if (!/^\d{6}$/.test(normalized)) {
      throw new ValidationError("Код подключения должен состоять из 6 цифр");
    }

    const cabinet = await this.repo.findCabinetByPairingCode(normalized);
    if (!cabinet) throw new NotFoundError("Кабинет с таким кодом не найден");

    return {
      id: cabinet.id,
      name: cabinet.name,
      pairingCode: cabinet.pairingCode,
    };
  }

  async getCabinetPublic(cabinetId: string) {
    const cabinet = await this.repo.findCabinetById(cabinetId);
    if (!cabinet) throw new NotFoundError("Кабинет не найден");
    return {
      id: cabinet.id,
      name: cabinet.name,
      clinicId: cabinet.clinicId,
    };
  }

  async createSession(cabinetId: string) {
    const cabinet = await this.repo.findCabinetById(cabinetId);
    if (!cabinet) throw new NotFoundError("Кабинет не найден");

    const { raw, hash } = generateLinkToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const session = await this.repo.createSession({
      id: randomUUID(),
      cabinetId: cabinet.id,
      clinicId: cabinet.clinicId,
      linkTokenHash: hash,
      expiresAt,
    });

    const base = getPublicAppBaseUrl();
    const linkUrl = `${base}/tablet/link?token=${encodeURIComponent(raw)}`;

    return {
      sessionId: session.id,
      linkToken: raw,
      linkUrl,
      expiresAt: expiresAt.toISOString(),
      cabinet: {
        id: cabinet.id,
        name: cabinet.name,
      },
    };
  }

  async getSessionStatus(sessionId: string) {
    const session = await this.repo.findSessionById(sessionId);
    if (!session) throw new NotFoundError("Сессия не найдена");

    if (session.status === "pending" && session.expiresAt < new Date()) {
      await this.repo.expireSession(session.id);
      return {
        sessionId: session.id,
        status: "expired" as const,
        cabinet: await this.getCabinetPublic(session.cabinetId),
      };
    }

    const cabinet = await this.repo.findCabinetById(session.cabinetId);
    let doctor: { id: string; name: string; specialty: string | null; avatarColor: string } | null = null;

    if (session.doctorUserId) {
      const doc = await this.repo.getDoctorPublic(session.doctorUserId);
      if (doc) {
        doctor = {
          id: doc.id,
          name: doc.name,
          specialty: doc.specialty,
          avatarColor: ROLE_COLORS[doc.role] ?? "#1f75fe",
        };
      }
    }

    return {
      sessionId: session.id,
      status: session.status,
      cabinet: cabinet
        ? { id: cabinet.id, name: cabinet.name }
        : { id: session.cabinetId, name: "Кабинет" },
      doctor,
      expiresAt: session.expiresAt.toISOString(),
      unlockedAt: session.unlockedAt?.toISOString() ?? null,
    };
  }

  async verifyCabinetPin(cabinetId: string, pin: string) {
    validatePin(pin);
    const cabinet = await this.repo.findCabinetById(cabinetId);
    if (!cabinet) throw new NotFoundError("Кабинет не найден");
    if (!cabinet.pinHash) throw new ValidationError("PIN кабинета не настроен");

    const ok = await bcrypt.compare(pin, cabinet.pinHash);
    if (!ok) throw new TabletPinInvalidError("Неверный PIN кабинета");

    return { success: true as const };
  }

  async getMe(userId: string, role: UserRole) {
    assertTabletRole(role);
    const pinHash = await this.repo.getUserTabletPinHash(userId);
    return { hasTabletPin: Boolean(pinHash) };
  }

  async setPin(userId: string, role: UserRole, pin: string, linkToken?: string) {
    assertTabletRole(role);
    validatePin(pin);

    const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);
    await this.repo.setUserTabletPinHash(userId, pinHash);

    if (linkToken) {
      return this.redeemLink(userId, role, linkToken, pin);
    }

    return { success: true as const, hasTabletPin: true };
  }

  async redeemLink(userId: string, role: UserRole, linkToken: string, pin?: string) {
    assertTabletRole(role);

    const pinHash = await this.repo.getUserTabletPinHash(userId);
    if (!pinHash) {
      throw new TabletPinSetupRequiredError(linkToken);
    }

    if (!pin) {
      throw new TabletPinRequiredError();
    }

    validatePin(pin);
    const pinOk = await bcrypt.compare(pin, pinHash);
    if (!pinOk) throw new TabletPinInvalidError();

    const session = await this.repo.findPendingSessionByTokenHash(hashToken(linkToken));
    if (!session) throw new NotFoundError("Ссылка устарела или уже использована");

    const unlocked = await this.repo.unlockSession(session.id, userId);
    if (!unlocked) throw new NotFoundError("Не удалось разблокировать планшет");

    const doctor = await this.repo.getDoctorPublic(userId);
    const cabinet = await this.repo.findCabinetById(session.cabinetId);

    return {
      success: true as const,
      sessionId: session.id,
      cabinet: cabinet ? { id: cabinet.id, name: cabinet.name } : null,
      doctor: doctor
        ? {
            id: doctor.id,
            name: doctor.name,
            specialty: doctor.specialty ?? (role === "owner" ? "Владелец · врач" : "Врач"),
            avatarColor: ROLE_COLORS[doctor.role] ?? "#1f75fe",
          }
        : null,
    };
  }
}

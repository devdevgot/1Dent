import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID, randomBytes, createHash } from "crypto";
import { TabletRepository } from "./tablet.repository";
import { AuthRepository } from "../auth/auth.repository";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  TabletPinInvalidError,
  TabletCabinetStaleError,
  TabletNotPairedByOwnerError,
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
  assistant: "#10b981",
  nurse: "#f59e0b",
};

const TABLET_UNLOCK_ROLES: UserRole[] = ["doctor", "owner", "admin", "assistant", "nurse"];

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateLinkToken(): { raw: string; hash: string } {
  const raw = randomBytes(24).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

function assertTabletRole(role: UserRole) {
  if (!TABLET_UNLOCK_ROLES.includes(role)) {
    throw new ForbiddenError("Только сотрудник клиники может войти в планшетный кабинет");
  }
}

function assertTabletOwner(role: UserRole) {
  if (role !== "owner") {
    throw new ForbiddenError("Только владелец клиники может подтвердить подключение планшета");
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

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required.");
  }
  return secret;
}

const TABLET_AUTH_TTL = "12h";

export class TabletService {
  private repo = new TabletRepository();
  private authRepo = new AuthRepository();

  private async assertActiveClinic(clinicId: string) {
    const active = await this.authRepo.isClinicActive(clinicId);
    if (!active) {
      throw new TabletCabinetStaleError();
    }
  }

  private async assertActiveCabinet(cabinetId: string) {
    const cabinet = await this.repo.findCabinetById(cabinetId);
    if (!cabinet) {
      throw new NotFoundError("Кабинет не найден");
    }
    await this.assertActiveClinic(cabinet.clinicId);
    return cabinet;
  }

  async getPendingPairing(_userId: string, role: UserRole, clinicId: string) {
    assertTabletOwner(role);

    const session = await this.repo.findAwaitingPairingForClinic(clinicId);
    if (!session?.cabinetId) return null;

    const cabinet = await this.repo.findCabinetById(session.cabinetId);
    if (!cabinet) return null;

    return {
      sessionId: session.id,
      cabinet: { id: cabinet.id, name: cabinet.name },
    };
  }

  private buildDoctorPublic(
    doc: { id: string; name: string; role: UserRole; specialty: string | null },
    role?: UserRole,
  ) {
    return {
      id: doc.id,
      name: doc.name,
      specialty: doc.specialty ?? (role === "owner" ? "Владелец · врач" : "Врач"),
      avatarColor: ROLE_COLORS[doc.role] ?? "#1f75fe",
    };
  }

  private async buildSessionAuth(doctorUserId: string, clinicId: string) {
    const user = await this.authRepo.findUserById(doctorUserId);
    const clinic = user ? await this.authRepo.findClinicById(clinicId) : undefined;
    if (!user || !clinic) return null;

    const { passwordHash: _, tabletPinHash: __, ...safeUser } = user;
    const token = jwt.sign(
      {
        userId: user.id,
        clinicId,
        role: user.role,
        email: user.email,
      },
      getJwtSecret(),
      { expiresIn: TABLET_AUTH_TTL },
    );
    return { token, user: safeUser, clinic };
  }

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
    await this.assertActiveClinic(cabinet.clinicId);

    return {
      id: cabinet.id,
      name: cabinet.name,
      pairingCode: cabinet.pairingCode,
    };
  }

  async issuePairingCode(clinicId: string, role: UserRole, cabinetId?: string) {
    assertTabletOwner(role);
    let cabinet = cabinetId
      ? await this.repo.findCabinetById(cabinetId)
      : await this.repo.findDefaultCabinet(clinicId);

    if (!cabinet) {
      cabinet = await this.seedDefaultCabinet(clinicId, "Клиника");
    }

    if (cabinet.clinicId !== clinicId) {
      throw new ForbiddenError("Кабинет не принадлежит вашей клинике");
    }

    const pairingCode = generatePairingCode();
    const updated = await this.repo.updatePairingCode(cabinet.id, pairingCode);
    if (!updated) throw new NotFoundError("Кабинет не найден");

    const base = getPublicAppBaseUrl();
    return {
      cabinetId: updated.id,
      name: updated.name,
      pairingCode,
      tabletUrl: `${base}/tablet?cabinet=${updated.id}`,
      expiresInSeconds: 300,
    };
  }

  async getCabinetPublic(cabinetId: string) {
    const cabinet = await this.assertActiveCabinet(cabinetId);
    return {
      id: cabinet.id,
      name: cabinet.name,
      clinicId: cabinet.clinicId,
    };
  }

  async createBootstrapSession() {
    const { raw, hash } = generateLinkToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const session = await this.repo.createBootstrapSession({
      id: randomUUID(),
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
      cabinet: null,
      bootstrap: true as const,
    };
  }

  async createSession(cabinetId: string) {
    const cabinet = await this.assertActiveCabinet(cabinetId);

    await this.repo.expirePendingSessionsForCabinet(cabinet.id);

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
      bootstrap: false as const,
    };
  }

  async getSessionStatus(sessionId: string) {
    const session = await this.repo.findSessionById(sessionId);
    if (!session) throw new NotFoundError("Сессия не найдена");

    const isActive =
      session.status === "pending" || session.status === "awaiting_pairing";

    if (isActive && session.expiresAt < new Date()) {
      await this.repo.expireSession(session.id);
      return {
        sessionId: session.id,
        status: "expired" as const,
        cabinet: session.cabinetId
          ? await this.getCabinetPublic(session.cabinetId)
          : null,
      };
    }

    const cabinet = session.cabinetId
      ? await this.repo.findCabinetById(session.cabinetId)
      : null;

    let doctor: { id: string; name: string; specialty: string | null; avatarColor: string } | null =
      null;

    if (session.doctorUserId) {
      const doc = await this.repo.getDoctorPublic(session.doctorUserId);
      if (doc) {
        doctor = this.buildDoctorPublic(doc);
      }
    }

    let auth: {
      token: string;
      user: Record<string, unknown>;
      clinic: Record<string, unknown>;
    } | null = null;

    if (session.status === "unlocked" && session.doctorUserId && session.clinicId) {
      auth = await this.buildSessionAuth(session.doctorUserId, session.clinicId);
    }

    return {
      sessionId: session.id,
      status: session.status,
      cabinet: cabinet
        ? { id: cabinet.id, name: cabinet.name }
        : session.cabinetId
          ? { id: session.cabinetId, name: "Кабинет" }
          : null,
      doctor,
      expiresAt: session.expiresAt.toISOString(),
      unlockedAt: session.unlockedAt?.toISOString() ?? null,
      auth,
    };
  }

  async resendPairingCode(userId: string, role: UserRole, sessionId: string) {
    assertTabletOwner(role);

    const session = await this.repo.findSessionById(sessionId);
    if (!session) throw new NotFoundError("Сессия не найдена");
    if (session.status !== "awaiting_pairing") {
      throw new ValidationError("Сессия не ожидает подключения");
    }
    if (!session.cabinetId || !session.clinicId) {
      throw new ValidationError("Кабинет не назначен");
    }

    const user = await this.authRepo.findUserById(userId);
    if (!user || user.clinicId !== session.clinicId) {
      throw new ForbiddenError("Сессия не принадлежит вашей клинике");
    }

    const pairingCode = generatePairingCode();
    const updated = await this.repo.updatePairingCode(session.cabinetId, pairingCode);
    if (!updated) throw new NotFoundError("Кабинет не найден");

    return {
      success: true as const,
      sessionId: session.id,
      pairingCode,
      cabinet: { id: updated.id, name: updated.name },
    };
  }

  async confirmPairing(
    sessionId: string,
    options?: { userId?: string; role?: UserRole; clinicId?: string },
  ) {
    if (options?.role) {
      assertTabletOwner(options.role);
    }

    const session = await this.repo.findSessionById(sessionId);
    if (!session) throw new NotFoundError("Сессия не найдена");
    if (session.status !== "awaiting_pairing") {
      throw new ValidationError("Сессия не ожидает подключения");
    }
    if (!session.cabinetId) throw new ValidationError("Кабинет не назначен");
    if (options?.clinicId && session.clinicId !== options.clinicId) {
      throw new ForbiddenError("Сессия не принадлежит вашей клинике");
    }

    const cabinet = await this.repo.findCabinetById(session.cabinetId);
    if (!cabinet) throw new NotFoundError("Кабинет не найден");

    const unlocked = await this.repo.confirmPairingSession(session.id, cabinet.id);
    if (!unlocked) throw new NotFoundError("Не удалось подключить планшет");

    const doctor = session.doctorUserId
      ? await this.repo.getDoctorPublic(session.doctorUserId)
      : null;

    let auth = null;
    if (session.doctorUserId && session.clinicId) {
      auth = await this.buildSessionAuth(session.doctorUserId, session.clinicId);
    }

    return {
      success: true as const,
      sessionId: session.id,
      cabinet: { id: cabinet.id, name: cabinet.name },
      doctor: doctor ? this.buildDoctorPublic(doctor) : null,
      auth,
    };
  }

  async verifyCabinetPin(cabinetId: string, pin: string) {
    validatePin(pin);
    const cabinet = await this.assertActiveCabinet(cabinetId);
    if (!cabinet.pinHash) throw new ValidationError("PIN кабинета не настроен");

    const ok = await bcrypt.compare(pin, cabinet.pinHash);
    if (!ok) throw new TabletPinInvalidError("Неверный PIN кабинета");

    return { success: true as const };
  }

  async unlockByUserPin(cabinetId: string, pin: string) {
    validatePin(pin);
    const cabinet = await this.assertActiveCabinet(cabinetId);

    const users = await this.repo.listTabletUsersWithPins(cabinet.clinicId);
    let matched: (typeof users)[number] | null = null;
    for (const user of users) {
      if (!user.tabletPinHash) continue;
      const ok = await bcrypt.compare(pin, user.tabletPinHash);
      if (ok) {
        matched = user;
        break;
      }
    }

    if (!matched) throw new TabletPinInvalidError("Неверный PIN. Настройте PIN в CRM, если ещё не сделали.");

    const auth = await this.buildSessionAuth(matched.id, cabinet.clinicId);
    if (!auth) throw new NotFoundError("Не удалось авторизовать врача");

    return {
      success: true as const,
      cabinet: { id: cabinet.id, name: cabinet.name },
      doctor: this.buildDoctorPublic(matched, matched.role),
      auth,
    };
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
      return this.redeemLink(userId, role, linkToken);
    }

    return { success: true as const, hasTabletPin: true };
  }

  async redeemLink(userId: string, role: UserRole, linkToken: string, pin?: string) {
    assertTabletRole(role);

    const session = await this.repo.findPendingSessionByTokenHash(hashToken(linkToken));
    if (!session) throw new NotFoundError("Ссылка устарела или уже использована");

    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new NotFoundError("Пользователь не найден");

    // First-time pairing: tablet has no cabinet yet — only the clinic owner may connect it
    if (!session.cabinetId) {
      if (role !== "owner") {
        throw new TabletNotPairedByOwnerError();
      }

      const clinic = await this.authRepo.findClinicById(user.clinicId);
      let cabinet = await this.repo.findDefaultCabinet(user.clinicId);
      if (!cabinet) {
        cabinet = await this.seedDefaultCabinet(user.clinicId, clinic?.name ?? "Клиника");
      }

      const assigned = await this.repo.assignSessionForPairing(
        session.id,
        cabinet.id,
        user.clinicId,
        userId,
      );
      if (!assigned) throw new NotFoundError("Не удалось начать подключение планшета");

      const doctor = await this.repo.getDoctorPublic(userId);

      return {
        success: true as const,
        pairingRequired: true as const,
        sessionId: session.id,
        cabinet: { id: cabinet.id, name: cabinet.name },
        doctor: doctor ? this.buildDoctorPublic(doctor, role) : null,
      };
    }

    if (session.clinicId) {
      await this.assertActiveClinic(session.clinicId);
    }

    if (user.clinicId !== session.clinicId) {
      throw new TabletCabinetStaleError(
        "QR-код от другой клиники. На планшете нажмите «Обновить код» и отсканируйте новый QR.",
      );
    }

    // Optional PIN verification when user explicitly provides it (tablet PIN path)
    if (pin) {
      const pinHash = await this.repo.getUserTabletPinHash(userId);
      if (!pinHash) {
        throw new TabletPinInvalidError("PIN не настроен. Отсканируйте QR-код или настройте PIN в CRM.");
      }
      const pinOk = await bcrypt.compare(pin, pinHash);
      if (!pinOk) throw new TabletPinInvalidError();
    }

    const unlocked = await this.repo.unlockSession(session.id, userId);
    if (!unlocked) throw new NotFoundError("Не удалось разблокировать планшет");

    const doctor = await this.repo.getDoctorPublic(userId);
    const cabinet = await this.repo.findCabinetById(session.cabinetId);

    return {
      success: true as const,
      pairingRequired: false as const,
      sessionId: session.id,
      cabinet: cabinet ? { id: cabinet.id, name: cabinet.name } : null,
      doctor: doctor ? this.buildDoctorPublic(doctor, role) : null,
    };
  }
}

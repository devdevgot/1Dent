import type { User } from "@workspace/api-client-react";
import type { TabletDoctor } from "./mock-data";

const CABINET_KEY = "1dent:tablet-cabinet-session";

export type TabletRole = "doctor" | "owner" | "admin";

export interface TabletSession {
  mode: "crm" | "cabinet";
  doctor: TabletDoctor;
  role: TabletRole;
  userId?: string;
}

const ROLE_COLORS: Record<string, string> = {
  doctor: "#1f75fe",
  owner: "#7c3aed",
  admin: "#0ea5e9",
};

export function userToTabletDoctor(user: User): TabletDoctor {
  return {
    id: user.id,
    name: user.name,
    specialty: user.role === "owner" ? "Владелец · врач" : user.role === "admin" ? "Администратор" : "Врач",
    avatarColor: ROLE_COLORS[user.role] ?? "#1f75fe",
  };
}

export function canAccessTablet(role: string | undefined): role is TabletRole {
  return role === "doctor" || role === "owner" || role === "admin";
}

export function setCabinetSession(doctor: TabletDoctor, cabinetId: string) {
  sessionStorage.setItem(CABINET_KEY, JSON.stringify({ doctor, cabinetId, ts: Date.now() }));
}

export function getCabinetSession(): { doctor: TabletDoctor; cabinetId: string } | null {
  try {
    const raw = sessionStorage.getItem(CABINET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { doctor: TabletDoctor; cabinetId: string; ts: number };
    if (!parsed.doctor?.id) return null;
    return { doctor: parsed.doctor, cabinetId: parsed.cabinetId };
  } catch {
    return null;
  }
}

export function clearCabinetSession() {
  sessionStorage.removeItem(CABINET_KEY);
}

export function resolveTabletSession(user: User | null): TabletSession | null {
  if (user && canAccessTablet(user.role)) {
    return {
      mode: "crm",
      doctor: userToTabletDoctor(user),
      role: user.role,
      userId: user.id,
    };
  }
  const cabinet = getCabinetSession();
  if (cabinet) {
    return {
      mode: "cabinet",
      doctor: cabinet.doctor,
      role: "doctor",
    };
  }
  return null;
}

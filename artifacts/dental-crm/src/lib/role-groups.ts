import type { UserRole } from "./role-redirect";

/** Doctor, assistant, and nurse — share the clinical home dashboard and schedule. */
export const CLINICAL_STAFF_ROLES = ["doctor", "assistant", "nurse"] as const satisfies readonly UserRole[];

export type ClinicalStaffRole = (typeof CLINICAL_STAFF_ROLES)[number];

/**
 * Roles that can be assigned as treating physician (лечащий врач):
 * clinic doctors and the owner (owners often also see patients).
 */
export const TREATING_DOCTOR_ROLES = ["doctor", "owner"] as const satisfies readonly UserRole[];

export type TreatingDoctorRole = (typeof TREATING_DOCTOR_ROLES)[number];

export function isClinicalStaff(role: string | undefined | null): role is ClinicalStaffRole {
  return role != null && (CLINICAL_STAFF_ROLES as readonly string[]).includes(role);
}

export function isDoctorRole(role: string | undefined | null): boolean {
  return role === "doctor";
}

/** True when this user can be selected as лечащий врач / appointment doctor. */
export function canBeTreatingDoctor(role: string | undefined | null): boolean {
  return role != null && (TREATING_DOCTOR_ROLES as readonly string[]).includes(role);
}

export function filterTreatingDoctors<T extends { role: string }>(users: readonly T[]): T[] {
  return users.filter((u) => canBeTreatingDoctor(u.role));
}

/** Display name in doctor pickers — owners are labeled so admins can find them. */
export function treatingDoctorLabel(user: { name: string; role: string }): string {
  return user.role === "owner" ? `${user.name} (владелец)` : user.name;
}

/** Roles that see clinic-wide procedures instead of only their own doctorId. */
export function seesClinicSchedule(role: string | undefined | null): boolean {
  return role === "owner" || role === "assistant" || role === "nurse" || role === "admin";
}

/** Owner + clinical staff share the /schedule calendar (month + day timeline). */
export function usesScheduleCalendar(role: string | undefined | null): boolean {
  return role === "owner" || isClinicalStaff(role);
}

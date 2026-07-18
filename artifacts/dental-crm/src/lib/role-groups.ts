import type { UserRole } from "./role-redirect";

/** Doctor, assistant, and nurse — share the clinical home dashboard and schedule. */
export const CLINICAL_STAFF_ROLES = ["doctor", "assistant", "nurse"] as const satisfies readonly UserRole[];

export type ClinicalStaffRole = (typeof CLINICAL_STAFF_ROLES)[number];

export function isClinicalStaff(role: string | undefined | null): role is ClinicalStaffRole {
  return role != null && (CLINICAL_STAFF_ROLES as readonly string[]).includes(role);
}

export function isDoctorRole(role: string | undefined | null): boolean {
  return role === "doctor";
}

/** Roles that see clinic-wide procedures instead of only their own doctorId. */
export function seesClinicSchedule(role: string | undefined | null): boolean {
  return role === "owner" || role === "assistant" || role === "nurse" || role === "admin";
}

/** Owner + clinical staff share the /schedule calendar (month + day timeline). */
export function usesScheduleCalendar(role: string | undefined | null): boolean {
  return role === "owner" || isClinicalStaff(role);
}

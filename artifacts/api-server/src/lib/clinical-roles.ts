import { roleGuard } from "../middlewares/auth.middleware";

/** Doctor, assistant, nurse — clinical cabinet staff with dental chart access. */
export const clinicalReadRoles = roleGuard(
  "owner",
  "admin",
  "doctor",
  "assistant",
  "nurse",
);

export const clinicalWriteRoles = roleGuard(
  "owner",
  "admin",
  "doctor",
  "assistant",
  "nurse",
);

/**
 * Users who can be the treating physician (лечащий врач) on a patient / appointment.
 * Owners often practice clinically and must appear in doctor pickers & schedule filters.
 */
export const TREATING_DOCTOR_ROLES = ["doctor", "owner"] as const;

export type TreatingDoctorRole = (typeof TREATING_DOCTOR_ROLES)[number];

export function canBeTreatingDoctor(role: string | undefined | null): boolean {
  return role != null && (TREATING_DOCTOR_ROLES as readonly string[]).includes(role);
}

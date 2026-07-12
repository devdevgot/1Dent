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

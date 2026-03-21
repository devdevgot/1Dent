export type UserRole = "owner" | "admin" | "doctor" | "accountant" | "warehouse";

export function getRoleDashboardPath(role: UserRole | string): string {
  switch (role) {
    case "owner":
    case "admin":
      return "/dashboard";
    case "doctor":
      return "/dashboard/doctor";
    case "accountant":
      return "/dashboard/accountant";
    case "warehouse":
      return "/dashboard/warehouse";
    default:
      return "/dashboard";
  }
}

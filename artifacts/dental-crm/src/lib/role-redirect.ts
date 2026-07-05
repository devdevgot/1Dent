export type UserRole = "owner" | "admin" | "doctor" | "accountant" | "warehouse" | "assistant" | "nurse";

export function getRoleDashboardPath(role: UserRole | string): string {
  switch (role) {
    case "owner":
      return "/dashboard";
    case "admin":
      return "/dashboard/admin";
    case "doctor":
    case "assistant":
    case "nurse":
      return "/dashboard/doctor";
    case "accountant":
      return "/dashboard/accountant";
    case "warehouse":
      return "/dashboard/warehouse";
    default:
      return "/menu";
  }
}

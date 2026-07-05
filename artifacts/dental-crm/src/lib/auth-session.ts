import type { AuthResponseData } from "@workspace/api-client-react";
import { saveAuthToken } from "@/lib/auth-token";

export type AuthPayload = AuthResponseData & { token?: string };

export function persistAuthSession(data: AuthPayload): void {
  if (data.token) saveAuthToken(data.token);
}

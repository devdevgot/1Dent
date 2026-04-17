export * from "./generated/api";
export * from "./generated/api.schemas";
export {
  setBaseUrl,
  setAuthTokenGetter,
  setUnauthorizedHandler,
  customFetch,
} from "./custom-fetch";
export type { AuthTokenGetter, UnauthorizedHandler } from "./custom-fetch";

// ─── Custom: update own profile ───────────────────────────────────────────────
import { customFetch } from "./custom-fetch";
import { useMutation } from "@tanstack/react-query";
import type { UseMutationOptions } from "@tanstack/react-query";

export interface UpdateProfileRequest {
  name?: string;
  email?: string;
  photoUrl?: string | null;
}

export interface UpdateProfileResponse {
  success: boolean;
  data: { user: Record<string, unknown> };
}

export const updateProfile = (
  data: UpdateProfileRequest,
  options?: RequestInit,
): Promise<UpdateProfileResponse> =>
  customFetch<UpdateProfileResponse>("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify(data),
    ...options,
  });

export const useUpdateProfile = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    UpdateProfileResponse,
    TError,
    UpdateProfileRequest
  >;
}) =>
  useMutation<UpdateProfileResponse, TError, UpdateProfileRequest>({
    mutationFn: (data) => updateProfile(data),
    ...options?.mutation,
  });

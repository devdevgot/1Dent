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
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  UseMutationOptions,
  UseQueryOptions,
} from "@tanstack/react-query";

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

// ─── Custom: chatbot session messages ────────────────────────────────────────

export interface ChatbotMessage {
  id: string;
  clinicId: string;
  phone: string;
  direction: "inbound" | "outbound";
  content: string;
  createdAt: string;
}

export interface GetChatbotSessionMessagesResponse {
  success: boolean;
  data: { messages: ChatbotMessage[] };
}

export const getChatbotSessionMessages = (
  phone: string,
  options?: RequestInit,
): Promise<GetChatbotSessionMessagesResponse> =>
  customFetch<GetChatbotSessionMessagesResponse>(
    `/api/chatbot/sessions/${encodeURIComponent(phone)}/messages`,
    { method: "GET", ...options },
  );

export const useGetChatbotSessionMessages = <TError = unknown>(
  phone: string,
  options?: {
    query?: UseQueryOptions<GetChatbotSessionMessagesResponse, TError>;
  },
) =>
  useQuery<GetChatbotSessionMessagesResponse, TError>({
    queryKey: ["/api/chatbot/sessions", phone, "messages"],
    queryFn: ({ signal }) => getChatbotSessionMessages(phone, { signal }),
    enabled: !!phone,
    ...options?.query,
  });

// ─── Custom: payroll ──────────────────────────────────────────────────────────

export type SalaryType = "fixed" | "commission" | "fixed_plus_commission";
export type PayrollStatus = "pending" | "approved" | "paid";

export interface SalarySettings {
  userId: string;
  clinicId: string;
  salaryType: SalaryType;
  fixedAmount: string;
  commissionPercent: string;
  updatedAt: string;
  userName?: string | null;
  userRole?: string | null;
}

export interface PayrollRecord {
  id: string;
  clinicId: string;
  userId: string;
  periodMonth: number;
  periodYear: number;
  salaryType: SalaryType;
  fixedAmount: string;
  commissionPercent: string;
  revenueBase: string;
  calculatedAmount: string;
  approvedAmount: string | null;
  status: PayrollStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  userName?: string | null;
  userRole?: string | null;
}

export interface GetPayrollRecordsResponse {
  success: boolean;
  data: { records: PayrollRecord[] };
}

export interface GetSalarySettingsResponse {
  success: boolean;
  data: { settings: SalarySettings | null };
}

export interface GetAllSalarySettingsResponse {
  success: boolean;
  data: { settings: SalarySettings[] };
}

export interface CalculatePayrollRequest {
  userId: string;
  periodYear: number;
  periodMonth: number;
}

export interface ApprovePayrollRequest {
  approvedAmount: number;
}

export interface UpdateSalarySettingsRequest {
  salaryType: SalaryType;
  fixedAmount: number;
  commissionPercent: number;
}

export const getPayrollRecords = (
  userId?: string,
  options?: RequestInit,
): Promise<GetPayrollRecordsResponse> =>
  customFetch<GetPayrollRecordsResponse>(
    `/api/payroll/records${userId ? `?userId=${userId}` : ""}`,
    { method: "GET", ...options },
  );

export const getMyPayrollRecords = (
  options?: RequestInit,
): Promise<GetPayrollRecordsResponse> =>
  customFetch<GetPayrollRecordsResponse>("/api/payroll/my", {
    method: "GET",
    ...options,
  });

export const getSalarySettings = (
  userId: string,
  options?: RequestInit,
): Promise<GetSalarySettingsResponse> =>
  customFetch<GetSalarySettingsResponse>(`/api/payroll/settings/${userId}`, {
    method: "GET",
    ...options,
  });

export const getAllSalarySettings = (
  options?: RequestInit,
): Promise<GetAllSalarySettingsResponse> =>
  customFetch<GetAllSalarySettingsResponse>("/api/payroll/settings", {
    method: "GET",
    ...options,
  });

export const updateSalarySettings = (
  userId: string,
  data: UpdateSalarySettingsRequest,
  options?: RequestInit,
): Promise<GetSalarySettingsResponse> =>
  customFetch<GetSalarySettingsResponse>(`/api/payroll/settings/${userId}`, {
    method: "PUT",
    body: JSON.stringify(data),
    ...options,
  });

export const calculatePayroll = (
  data: CalculatePayrollRequest,
  options?: RequestInit,
): Promise<{ success: boolean; data: { record: PayrollRecord } }> =>
  customFetch("/api/payroll/calculate", {
    method: "POST",
    body: JSON.stringify(data),
    ...options,
  });

export const approvePayroll = (
  id: string,
  data: ApprovePayrollRequest,
  options?: RequestInit,
): Promise<{ success: boolean; data: { record: PayrollRecord } }> =>
  customFetch(`/api/payroll/approve/${id}`, {
    method: "POST",
    body: JSON.stringify(data),
    ...options,
  });

export const useGetPayrollRecords = <TError = unknown>(
  userId?: string,
  options?: { query?: UseQueryOptions<GetPayrollRecordsResponse, TError> },
) =>
  useQuery<GetPayrollRecordsResponse, TError>({
    queryKey: ["/api/payroll/records", userId],
    queryFn: ({ signal }) => getPayrollRecords(userId, { signal }),
    ...options?.query,
  });

export const useGetMyPayrollRecords = <TError = unknown>(options?: {
  query?: UseQueryOptions<GetPayrollRecordsResponse, TError>;
}) =>
  useQuery<GetPayrollRecordsResponse, TError>({
    queryKey: ["/api/payroll/my"],
    queryFn: ({ signal }) => getMyPayrollRecords({ signal }),
    ...options?.query,
  });

export const useGetSalarySettings = <TError = unknown>(
  userId: string,
  options?: { query?: UseQueryOptions<GetSalarySettingsResponse, TError> },
) =>
  useQuery<GetSalarySettingsResponse, TError>({
    queryKey: ["/api/payroll/settings", userId],
    queryFn: ({ signal }) => getSalarySettings(userId, { signal }),
    enabled: !!userId,
    ...options?.query,
  });

export const useGetAllSalarySettings = <TError = unknown>(options?: {
  query?: UseQueryOptions<GetAllSalarySettingsResponse, TError>;
}) =>
  useQuery<GetAllSalarySettingsResponse, TError>({
    queryKey: ["/api/payroll/settings"],
    queryFn: ({ signal }) => getAllSalarySettings({ signal }),
    ...options?.query,
  });

export const useUpdateSalarySettings = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    GetSalarySettingsResponse,
    TError,
    { userId: string; data: UpdateSalarySettingsRequest }
  >;
}) =>
  useMutation<
    GetSalarySettingsResponse,
    TError,
    { userId: string; data: UpdateSalarySettingsRequest }
  >({
    mutationFn: ({ userId, data }) => updateSalarySettings(userId, data),
    ...options?.mutation,
  });

export const useCalculatePayroll = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    { success: boolean; data: { record: PayrollRecord } },
    TError,
    CalculatePayrollRequest
  >;
}) =>
  useMutation<
    { success: boolean; data: { record: PayrollRecord } },
    TError,
    CalculatePayrollRequest
  >({
    mutationFn: (data) => calculatePayroll(data),
    ...options?.mutation,
  });

export const useApprovePayroll = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    { success: boolean; data: { record: PayrollRecord } },
    TError,
    { id: string; approvedAmount: number }
  >;
}) =>
  useMutation<
    { success: boolean; data: { record: PayrollRecord } },
    TError,
    { id: string; approvedAmount: number }
  >({
    mutationFn: ({ id, approvedAmount }) => approvePayroll(id, { approvedAmount }),
    ...options?.mutation,
  });

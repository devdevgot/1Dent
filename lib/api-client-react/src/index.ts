export * from "./generated/api";
export * from "./generated/api.schemas";
export {
  setBaseUrl,
  setAuthTokenGetter,
  setUnauthorizedHandler,
  customFetch,
} from "./custom-fetch";
export type { AuthTokenGetter, UnauthorizedHandler } from "./custom-fetch";

// ─── Custom hooks (manually maintained) ───────────────────────────────────────
import { customFetch } from "./custom-fetch";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";
import type { MySalaryResponse, UpdateUserStatusRequest, UsersListResponse } from "./generated/api.schemas";

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

export interface PayrollPreviewRow {
  userId: string;
  userName: string;
  userRole: string;
  salaryType: SalaryType;
  fixedAmount: number;
  commissionPercent: number;
  revenueBase: number;
  calculatedAmount: number;
}

export interface GetPayrollPreviewResponse {
  success: boolean;
  data: { preview: PayrollPreviewRow[]; totalFot: number };
}

export interface ApprovePeriodPayrollRequest {
  year: number;
  month: number;
  employees: Array<{
    userId: string;
    approvedAmount: number;
    notes?: string;
  }>;
}

export interface ApprovePeriodPayrollResponse {
  success: boolean;
  data: {
    records: PayrollRecord[];
    totalFot: number;
    expense: {
      id: string;
      clinicId: string;
      category: string;
      amount: string;
      description: string | null;
      periodMonth: number | null;
      periodYear: number | null;
    };
  };
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

export const getPayrollPreview = (
  year: number,
  month: number,
  options?: RequestInit,
): Promise<GetPayrollPreviewResponse> =>
  customFetch<GetPayrollPreviewResponse>(
    `/api/payroll/preview?year=${year}&month=${month}`,
    { method: "GET", ...options },
  );

export const approvePeriodPayroll = (
  data: ApprovePeriodPayrollRequest,
  options?: RequestInit,
): Promise<ApprovePeriodPayrollResponse> =>
  customFetch<ApprovePeriodPayrollResponse>("/api/payroll/approve", {
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

export const usePreviewPayroll = <TError = unknown>(
  year: number,
  month: number,
  options?: { query?: UseQueryOptions<GetPayrollPreviewResponse, TError> },
) =>
  useQuery<GetPayrollPreviewResponse, TError>({
    queryKey: ["/api/payroll/preview", year, month],
    queryFn: ({ signal }) => getPayrollPreview(year, month, { signal }),
    enabled: year > 0 && month > 0,
    ...options?.query,
  });

export const useApprovePayrollPeriod = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    ApprovePeriodPayrollResponse,
    TError,
    ApprovePeriodPayrollRequest
  >;
}) =>
  useMutation<ApprovePeriodPayrollResponse, TError, ApprovePeriodPayrollRequest>({
    mutationFn: (data) => approvePeriodPayroll(data),
    ...options?.mutation,
  });

// ─── Custom: list users with includeInactive option ───────────────────────────
export const listUsersAll = (
  params?: { includeInactive?: boolean },
  options?: RequestInit,
): Promise<UsersListResponse> => {
  const qs = params?.includeInactive ? "?includeInactive=true" : "";
  return customFetch<UsersListResponse>(`/api/users${qs}`, {
    method: "GET",
    ...options,
  });
};

export const getListUsersAllQueryKey = (includeInactive?: boolean) =>
  ["/api/users", { includeInactive: !!includeInactive }] as const;

export const useListUsersAll = <TError = unknown>(
  params?: { includeInactive?: boolean },
  options?: { query?: UseQueryOptions<UsersListResponse, TError> },
) =>
  useQuery<UsersListResponse, TError>({
    queryKey: getListUsersAllQueryKey(params?.includeInactive),
    queryFn: ({ signal }) => listUsersAll(params, { signal }),
    ...options?.query,
  });

// ─── Custom: update user status ───────────────────────────────────────────────
export interface UpdateUserStatusResponse {
  success: boolean;
  data: { user: Record<string, unknown> };
}

export const updateUserStatus = (
  id: string,
  data: UpdateUserStatusRequest,
  options?: RequestInit,
): Promise<UpdateUserStatusResponse> =>
  customFetch<UpdateUserStatusResponse>(`/api/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify(data),
    ...options,
  });

export const useUpdateUserStatus = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    UpdateUserStatusResponse,
    TError,
    { id: string; isActive: boolean }
  >;
}) =>
  useMutation<UpdateUserStatusResponse, TError, { id: string; isActive: boolean }>({
    mutationFn: ({ id, isActive }) => updateUserStatus(id, { isActive }),
    ...options?.mutation,
  });

// ─── Custom: get my salary ─────────────────────────────────────────────────────
export const getMySalary = (options?: RequestInit): Promise<MySalaryResponse> =>
  customFetch<MySalaryResponse>("/api/payroll/my-salary", {
    method: "GET",
    ...options,
  });

export const useGetMySalary = <TError = unknown>(options?: {
  query?: UseQueryOptions<MySalaryResponse, TError>;
}) =>
  useQuery<MySalaryResponse, TError>({
    queryKey: ["/api/payroll/my-salary"],
    queryFn: ({ signal }) => getMySalary({ signal }),
    ...options?.query,
  });

// ─── Custom: expenses ─────────────────────────────────────────────────────────

export type ExpenseCategory = "salary" | "materials" | "rent" | "utilities" | "equipment" | "marketing" | "other";

export interface ClinicExpense {
  id: string;
  clinicId: string;
  category: ExpenseCategory;
  subcategory: string | null;
  amount: string;
  description: string | null;
  expenseDate: string;
  periodMonth: number | null;
  periodYear: number | null;
  payrollRef: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface GetExpensesResponse {
  success: boolean;
  data: { expenses: ClinicExpense[] };
}

export interface GetExpenseResponse {
  success: boolean;
  data: { expense: ClinicExpense };
}

export interface CreateExpenseRequest {
  category: ExpenseCategory;
  subcategory?: string;
  amount: number;
  description?: string;
  expenseDate: string;
  periodMonth?: number;
  periodYear?: number;
}

export interface UpdateExpenseRequest extends Partial<CreateExpenseRequest> {}

export const listExpenses = (
  params?: { dateFrom?: string; dateTo?: string; category?: string; periodMonth?: number; periodYear?: number },
  options?: RequestInit,
): Promise<GetExpensesResponse> => {
  const qs = new URLSearchParams();
  if (params?.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qs.set("dateTo", params.dateTo);
  if (params?.category) qs.set("category", params.category);
  if (params?.periodMonth) qs.set("periodMonth", String(params.periodMonth));
  if (params?.periodYear) qs.set("periodYear", String(params.periodYear));
  const q = qs.toString();
  return customFetch<GetExpensesResponse>(`/api/expenses${q ? `?${q}` : ""}`, {
    method: "GET",
    ...options,
  });
};

export const createExpense = (
  data: CreateExpenseRequest,
  options?: RequestInit,
): Promise<GetExpenseResponse> =>
  customFetch<GetExpenseResponse>("/api/expenses", {
    method: "POST",
    body: JSON.stringify(data),
    ...options,
  });

export const updateExpense = (
  id: string,
  data: UpdateExpenseRequest,
  options?: RequestInit,
): Promise<GetExpenseResponse> =>
  customFetch<GetExpenseResponse>(`/api/expenses/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
    ...options,
  });

export const deleteExpense = (
  id: string,
  options?: RequestInit,
): Promise<GetExpenseResponse> =>
  customFetch<GetExpenseResponse>(`/api/expenses/${id}`, {
    method: "DELETE",
    ...options,
  });

export const useListExpenses = <TError = unknown>(
  params?: { dateFrom?: string; dateTo?: string; category?: string; periodMonth?: number; periodYear?: number },
  options?: { query?: UseQueryOptions<GetExpensesResponse, TError> },
) =>
  useQuery<GetExpensesResponse, TError>({
    queryKey: ["/api/expenses", params],
    queryFn: ({ signal }) => listExpenses(params, { signal }),
    ...options?.query,
  });

export const useCreateExpense = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<GetExpenseResponse, TError, CreateExpenseRequest>;
}) =>
  useMutation<GetExpenseResponse, TError, CreateExpenseRequest>({
    mutationFn: (data) => createExpense(data),
    ...options?.mutation,
  });

export const useUpdateExpense = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<GetExpenseResponse, TError, { id: string; data: UpdateExpenseRequest }>;
}) =>
  useMutation<GetExpenseResponse, TError, { id: string; data: UpdateExpenseRequest }>({
    mutationFn: ({ id, data }) => updateExpense(id, data),
    ...options?.mutation,
  });

export const useDeleteExpense = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<GetExpenseResponse, TError, string>;
}) =>
  useMutation<GetExpenseResponse, TError, string>({
    mutationFn: (id) => deleteExpense(id),
    ...options?.mutation,
  });

// ─── Custom: financial summary ────────────────────────────────────────────────

export interface FinancialSummary {
  totalRevenue: number;
  totalMaterialCost: number;
  totalOperationalExpenses: number;
  netProfit: number;
  marginPct: number;
  expensesByCategory: Record<string, number>;
  procedureCount: number;
}

export interface GetFinancialSummaryResponse {
  success: boolean;
  data: FinancialSummary;
}

export const getFinancialSummary = (
  params?: { dateFrom?: string; dateTo?: string },
  options?: RequestInit,
): Promise<GetFinancialSummaryResponse> => {
  const qs = new URLSearchParams();
  if (params?.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qs.set("dateTo", params.dateTo);
  const q = qs.toString();
  return customFetch<GetFinancialSummaryResponse>(
    `/api/analytics/financial-summary${q ? `?${q}` : ""}`,
    { method: "GET", ...options },
  );
};

export const useGetFinancialSummary = <TError = unknown>(
  params?: { dateFrom?: string; dateTo?: string },
  options?: { query?: UseQueryOptions<GetFinancialSummaryResponse, TError> },
) =>
  useQuery<GetFinancialSummaryResponse, TError>({
    queryKey: ["/api/analytics/financial-summary", params],
    queryFn: ({ signal }) => getFinancialSummary(params, { signal }),
    ...options?.query,
  });

// ─── Custom: patient metrics (retention, LTV, treatment plan conversion) ───────

export interface RetentionCohort {
  month: string;
  newPatients: number;
  returnedIn3m: number;
  returnedIn6m: number;
  returnedIn12m: number;
}

export interface TopPatientLtv {
  id: string;
  name: string;
  totalSpent: number;
  procedureCount: number;
}

export interface PatientMetrics {
  retentionRate: number;
  retentionCohorts: RetentionCohort[];
  avgLtv: number;
  medianLtv: number;
  topPatientsByLtv: TopPatientLtv[];
  treatmentPlanConversion: number;
  treatmentPlanAccepted: number;
  treatmentPlanTotal: number;
  treatmentItemCompletion: number;
}

export interface GetPatientMetricsResponse {
  success: boolean;
  data: PatientMetrics;
}

export const getPatientMetrics = (
  params?: { doctorId?: string },
  options?: RequestInit,
): Promise<GetPatientMetricsResponse> => {
  const qs = new URLSearchParams();
  if (params?.doctorId) qs.set("doctorId", params.doctorId);
  const q = qs.toString();
  return customFetch<GetPatientMetricsResponse>(
    `/api/analytics/patient-metrics${q ? `?${q}` : ""}`,
    { method: "GET", ...options },
  );
};

export const useGetPatientMetrics = <TError = unknown>(
  params?: { doctorId?: string },
  options?: { query?: UseQueryOptions<GetPatientMetricsResponse, TError> },
) =>
  useQuery<GetPatientMetricsResponse, TError>({
    queryKey: ["/api/analytics/patient-metrics", params],
    queryFn: ({ signal }) => getPatientMetrics(params, { signal }),
    ...options?.query,
  });

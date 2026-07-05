export * from "./generated/api";
export * from "./generated/api.schemas";
export {
  setBaseUrl,
  getBaseUrl,
  setAuthTokenGetter,
  setBranchIdGetter,
  setUnauthorizedHandler,
  customFetch,
  ApiError,
} from "./custom-fetch";
export type {
  AuthTokenGetter,
  BranchIdGetter,
  UnauthorizedHandler,
} from "./custom-fetch";

// ─── Custom hooks (manually maintained) ───────────────────────────────────────
import { customFetch } from "./custom-fetch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  UseMutationOptions,
  UseQueryOptions,
} from "@tanstack/react-query";
import type {
  MySalaryResponse,
  UpdateUserStatusRequest,
  UsersListResponse,
  Patient,
} from "./generated/api.schemas";

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

export interface PatchChatbotSessionTakeoverResponse {
  success: boolean;
  data: {
    session: {
      id: string;
      clinicId: string;
      phone: string;
      state: string;
      data?: Record<string, unknown>;
      humanTakeover: boolean;
      updatedAt: string;
    };
  };
}

export const patchChatbotSessionTakeover = (
  phone: string,
  takeover: boolean,
  options?: RequestInit,
): Promise<PatchChatbotSessionTakeoverResponse> =>
  customFetch<PatchChatbotSessionTakeoverResponse>(
    `/api/chatbot/sessions/${encodeURIComponent(phone)}/takeover`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ takeover }),
      ...options,
    },
  );

export const usePatchChatbotSessionTakeover = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    PatchChatbotSessionTakeoverResponse,
    TError,
    { phone: string; takeover: boolean }
  >;
}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ phone, takeover }) =>
      patchChatbotSessionTakeover(phone, takeover),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chatbot/sessions"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/chatbot/sessions", variables.phone, "messages"],
      });
    },
    ...options?.mutation,
  });
};

export interface FunnelStageMetric {
  state: string;
  entered: number;
  progressed: number;
  conversionRate: number;
}

export interface VariantFunnelMetric {
  variantId: string;
  variantName: string;
  sessions: number;
  bookings: number;
  bookingRate: number;
  handoffs: number;
}

export interface ChatbotFunnelAnalytics {
  periodDays: number;
  totalSessions: number;
  totalBookings: number;
  overallBookingRate: number;
  stages: FunnelStageMetric[];
  variants: VariantFunnelMetric[];
}

export interface GetChatbotFunnelAnalyticsResponse {
  success: boolean;
  data: { analytics: ChatbotFunnelAnalytics };
}

export const getChatbotFunnelAnalytics = (
  days = 30,
  options?: RequestInit,
): Promise<GetChatbotFunnelAnalyticsResponse> =>
  customFetch<GetChatbotFunnelAnalyticsResponse>(
    `/api/chatbot/analytics/funnel?days=${days}`,
    { method: "GET", ...options },
  );

export const useGetChatbotFunnelAnalytics = <TError = unknown>(
  days = 30,
  options?: {
    query?: UseQueryOptions<GetChatbotFunnelAnalyticsResponse, TError>;
  },
) =>
  useQuery<GetChatbotFunnelAnalyticsResponse, TError>({
    queryKey: ["/api/chatbot/analytics/funnel", days],
    queryFn: ({ signal }) => getChatbotFunnelAnalytics(days, { signal }),
    ...options?.query,
  });

export interface ChatbotManagerExample {
  id: string;
  clinicId: string;
  userMessage: string;
  managerResponse: string;
  sortOrder: number;
  createdAt: string;
}

export interface StepInstructions {
  general?: string;
  greeting?: string;
  collectName?: string;
  collectProblem?: string;
  suggestDoctor?: string;
  confirm?: string;
}

export interface ListManagerExamplesResponse {
  success: boolean;
  data: { examples: ChatbotManagerExample[] };
}

export interface ManagerExampleResponse {
  success: boolean;
  data: { example: ChatbotManagerExample };
}

export const listManagerExamples = (
  options?: RequestInit,
): Promise<ListManagerExamplesResponse> =>
  customFetch<ListManagerExamplesResponse>("/api/chatbot/manager-examples", {
    method: "GET",
    ...options,
  });

export const useListManagerExamples = <TError = unknown>(options?: {
  query?: UseQueryOptions<ListManagerExamplesResponse, TError>;
}) =>
  useQuery<ListManagerExamplesResponse, TError>({
    queryKey: ["/api/chatbot/manager-examples"],
    queryFn: ({ signal }) => listManagerExamples({ signal }),
    ...options?.query,
  });

export const createManagerExample = (data: {
  userMessage: string;
  managerResponse: string;
}): Promise<ManagerExampleResponse> =>
  customFetch<ManagerExampleResponse>("/api/chatbot/manager-examples", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useCreateManagerExample = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    ManagerExampleResponse,
    TError,
    { userMessage: string; managerResponse: string }
  >;
}) =>
  useMutation<
    ManagerExampleResponse,
    TError,
    { userMessage: string; managerResponse: string }
  >({
    mutationFn: (data) => createManagerExample(data),
    ...options?.mutation,
  });

export const updateManagerExample = (
  id: string,
  data: { userMessage?: string; managerResponse?: string },
): Promise<ManagerExampleResponse> =>
  customFetch<ManagerExampleResponse>(
    `/api/chatbot/manager-examples/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
  );

export const deleteManagerExample = (
  id: string,
): Promise<{ success: boolean }> =>
  customFetch<{ success: boolean }>(
    `/api/chatbot/manager-examples/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );

export const useDeleteManagerExample = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<{ success: boolean }, TError, string>;
}) =>
  useMutation<{ success: boolean }, TError, string>({
    mutationFn: (id) => deleteManagerExample(id),
    ...options?.mutation,
  });

export const reorderManagerExample = (
  id: string,
  sortOrder: number,
): Promise<ManagerExampleResponse> =>
  customFetch<ManagerExampleResponse>(
    `/api/chatbot/manager-examples/${encodeURIComponent(id)}/reorder`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sortOrder }),
    },
  );

export type PlaygroundScenario =
  | "new_patient"
  | "returning_no_appt"
  | "returning_with_appt"
  | "wants_existing_appt"
  | "post_op_monitoring"
  | "repeat_sale"
  | "reactivation";

export interface PlaygroundSessionPayload {
  state: string;
  data?: Record<string, unknown>;
  humanTakeover?: boolean;
}

export interface TestMessageResponse {
  success: boolean;
  data: {
    reply: string;
    parts?: string[];
    pausesMs?: number[];
    fsmState?: string;
    humanTakeover?: boolean;
    sessionData?: Record<string, unknown>;
    mindMapNode?: { id: string; label: string; fsmState?: string } | null;
    simulatedActions?: string[];
  };
}

export const testChatbotMessage = (data: {
  userMessage: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  fsmState?: string;
  initGreeting?: boolean;
  scenario?: PlaygroundScenario;
  session?: PlaygroundSessionPayload;
}): Promise<TestMessageResponse> =>
  customFetch<TestMessageResponse>("/api/chatbot/test-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useTestChatbotMessage = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    TestMessageResponse,
    TError,
    {
      userMessage: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      fsmState?: string;
      initGreeting?: boolean;
      scenario?: PlaygroundScenario;
      session?: PlaygroundSessionPayload;
    }
  >;
}) =>
  useMutation<
    TestMessageResponse,
    TError,
    {
      userMessage: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      fsmState?: string;
      initGreeting?: boolean;
      scenario?: PlaygroundScenario;
      session?: PlaygroundSessionPayload;
    }
  >({
    mutationFn: (data) => testChatbotMessage(data),
    ...options?.mutation,
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
  useMutation<
    ApprovePeriodPayrollResponse,
    TError,
    ApprovePeriodPayrollRequest
  >({
    mutationFn: (data) => approvePeriodPayroll(data),
    ...options?.mutation,
  });

// ─── Custom: find patient by IIN ──────────────────────────────────────────────

export interface FindPatientByIINResponse {
  success: boolean;
  data: { patient: Patient | null };
}

export const findPatientByIIN = (
  iin: string,
  options?: RequestInit,
): Promise<FindPatientByIINResponse> =>
  customFetch<FindPatientByIINResponse>(
    `/api/patients/by-iin/${encodeURIComponent(iin)}`,
    { method: "GET", ...options },
  );

export const useFindPatientByIIN = <TError = unknown>(
  iin: string,
  options?: { query?: UseQueryOptions<FindPatientByIINResponse, TError> },
) =>
  useQuery<FindPatientByIINResponse, TError>({
    queryKey: ["/api/patients/by-iin", iin],
    queryFn: ({ signal }) => findPatientByIIN(iin, { signal }),
    enabled: /^\d{12}$/.test(iin),
    ...options?.query,
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
  useMutation<
    UpdateUserStatusResponse,
    TError,
    { id: string; isActive: boolean }
  >({
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

export type ExpenseCategory =
  | "salary"
  | "materials"
  | "rent"
  | "utilities"
  | "equipment"
  | "marketing"
  | "other";

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
  params?: {
    dateFrom?: string;
    dateTo?: string;
    category?: string;
    periodMonth?: number;
    periodYear?: number;
  },
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
  params?: {
    dateFrom?: string;
    dateTo?: string;
    category?: string;
    periodMonth?: number;
    periodYear?: number;
  },
  options?: { query?: UseQueryOptions<GetExpensesResponse, TError> },
) =>
  useQuery<GetExpensesResponse, TError>({
    queryKey: ["/api/expenses", params],
    queryFn: ({ signal }) => listExpenses(params, { signal }),
    ...options?.query,
  });

export const useCreateExpense = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    GetExpenseResponse,
    TError,
    CreateExpenseRequest
  >;
}) =>
  useMutation<GetExpenseResponse, TError, CreateExpenseRequest>({
    mutationFn: (data) => createExpense(data),
    ...options?.mutation,
  });

export const useUpdateExpense = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    GetExpenseResponse,
    TError,
    { id: string; data: UpdateExpenseRequest }
  >;
}) =>
  useMutation<
    GetExpenseResponse,
    TError,
    { id: string; data: UpdateExpenseRequest }
  >({
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
  params?: { doctorId?: string; dateFrom?: string; dateTo?: string },
  options?: RequestInit,
): Promise<GetPatientMetricsResponse> => {
  const qs = new URLSearchParams();
  if (params?.doctorId) qs.set("doctorId", params.doctorId);
  if (params?.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qs.set("dateTo", params.dateTo);
  const q = qs.toString();
  return customFetch<GetPatientMetricsResponse>(
    `/api/analytics/patient-metrics${q ? `?${q}` : ""}`,
    { method: "GET", ...options },
  );
};

export const useGetPatientMetrics = <TError = unknown>(
  params?: { doctorId?: string; dateFrom?: string; dateTo?: string },
  options?: { query?: UseQueryOptions<GetPatientMetricsResponse, TError> },
) =>
  useQuery<GetPatientMetricsResponse, TError>({
    queryKey: ["/api/analytics/patient-metrics", params],
    queryFn: ({ signal }) => getPatientMetrics(params, { signal }),
    ...options?.query,
  });

// ─── Dental AI Analysis ────────────────────────────────────────────────────────

export interface DentalAiAnalysisData {
  reportText: string;
  updatedAt: string;
}

export interface GetDentalAiAnalysisResponse {
  success: boolean;
  data: DentalAiAnalysisData | null;
}

export const getDentalAiAnalysis = (
  patientId: string,
  options?: RequestInit,
): Promise<GetDentalAiAnalysisResponse> =>
  customFetch<GetDentalAiAnalysisResponse>(
    `/api/patients/${patientId}/teeth/ai-analysis`,
    {
      method: "GET",
      ...options,
    },
  );

export const getDentalAiAnalysisQueryKey = (patientId: string) =>
  [`/api/patients/${patientId}/teeth/ai-analysis`] as const;

export const useGetDentalAiAnalysis = <TError = unknown>(
  patientId: string,
  options?: { query?: UseQueryOptions<GetDentalAiAnalysisResponse, TError> },
) =>
  useQuery<GetDentalAiAnalysisResponse, TError>({
    queryKey: getDentalAiAnalysisQueryKey(patientId),
    queryFn: ({ signal }) => getDentalAiAnalysis(patientId, { signal }),
    enabled: !!patientId,
    ...options?.query,
  });

export const triggerDentalAiAnalysis = (
  patientId: string,
): Promise<{ success: boolean }> =>
  customFetch<{ success: boolean }>(
    `/api/patients/${patientId}/teeth/trigger-ai-analysis`,
    {
      method: "POST",
    },
  );

export const useTriggerDentalAiAnalysis = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<{ success: boolean }, TError, string>;
}) =>
  useMutation<{ success: boolean }, TError, string>({
    mutationFn: (patientId) => triggerDentalAiAnalysis(patientId),
    ...options?.mutation,
  });

// ─── Dental Broadcast ────────────────────────────────────────────────────────

export interface DentalBroadcastRun {
  id: string;
  clinicId: string;
  runDate: string;
  status: "pending" | "running" | "completed" | "failed";
  totalPatients: number;
  processedPatients: number;
  messagesSent: number;
  repliesCount: number;
  bookingsCount: number;
  errorsCount: number;
  replyRate?: number;
  bookingRate?: number;
  startedAt: string;
  completedAt: string | null;
}

export interface DentalBroadcastDelivery {
  id: string;
  runId: string;
  runDate: string;
  content: string;
  usedAi: boolean;
  sentAt: string;
  repliedAt: string | null;
  bookedAt: string | null;
}

export interface ListDentalBroadcastRunsResponse {
  success: boolean;
  data: { runs: DentalBroadcastRun[] };
}

export interface ListPatientBroadcastHistoryResponse {
  success: boolean;
  data: { deliveries: DentalBroadcastDelivery[] };
}

export interface TriggerDentalBroadcastResponse {
  success: boolean;
  data: { run: DentalBroadcastRun | null };
}

export const listDentalBroadcastRunsQueryKey = (limit = 20) =>
  ["/api/dental-broadcast/runs", limit] as const;

export const listDentalBroadcastRuns = (
  limit = 20,
  options?: RequestInit,
): Promise<ListDentalBroadcastRunsResponse> =>
  customFetch<ListDentalBroadcastRunsResponse>(
    `/api/dental-broadcast/runs?limit=${limit}`,
    { method: "GET", ...options },
  );

export const useListDentalBroadcastRuns = <TError = unknown>(
  limit = 20,
  options?: {
    query?: UseQueryOptions<ListDentalBroadcastRunsResponse, TError>;
  },
) =>
  useQuery<ListDentalBroadcastRunsResponse, TError>({
    queryKey: listDentalBroadcastRunsQueryKey(limit),
    queryFn: ({ signal }) => listDentalBroadcastRuns(limit, { signal }),
    refetchInterval: (query) =>
      query.state.data?.data?.runs?.some((r) => r.status === "running")
        ? 2000
        : false,
    ...options?.query,
  });

export const triggerDentalBroadcast = (
  body: { force?: boolean } = { force: true },
  options?: RequestInit,
): Promise<TriggerDentalBroadcastResponse> =>
  customFetch<TriggerDentalBroadcastResponse>("/api/dental-broadcast/trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(body),
    ...options,
  });

export const useTriggerDentalBroadcast = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    TriggerDentalBroadcastResponse,
    TError,
    { force?: boolean } | void
  >;
}) =>
  useMutation<TriggerDentalBroadcastResponse, TError, { force?: boolean } | void>({
    mutationFn: (vars) => triggerDentalBroadcast({ force: vars?.force ?? true }),
    ...options?.mutation,
  });

export const listPatientBroadcastHistoryQueryKey = (patientId: string) =>
  ["/api/dental-broadcast/patients", patientId, "history"] as const;

export const listPatientBroadcastHistory = (
  patientId: string,
  options?: RequestInit,
): Promise<ListPatientBroadcastHistoryResponse> =>
  customFetch<ListPatientBroadcastHistoryResponse>(
    `/api/dental-broadcast/patients/${patientId}/history`,
    { method: "GET", ...options },
  );

export const useListPatientBroadcastHistory = <TError = unknown>(
  patientId: string | null,
  options?: {
    query?: UseQueryOptions<ListPatientBroadcastHistoryResponse, TError>;
  },
) =>
  useQuery<ListPatientBroadcastHistoryResponse, TError>({
    queryKey: listPatientBroadcastHistoryQueryKey(patientId ?? ""),
    queryFn: ({ signal }) => listPatientBroadcastHistory(patientId!, { signal }),
    enabled: !!patientId,
    ...options?.query,
  });

// ─── Custom: script blocks ────────────────────────────────────────────────────

export interface ScriptBlock {
  id: string;
  title: string;
  icon: string;
  description: string;
  content: string;
  enabled: boolean;
  order: number;
}

export interface GetStandardScriptBlocksResponse {
  success: boolean;
  data: { blocks: ScriptBlock[] };
}

export interface ParseScriptResponse {
  success: boolean;
  data: { blocks: ScriptBlock[] };
}

export const getStandardScriptBlocks = (
  options?: RequestInit,
): Promise<GetStandardScriptBlocksResponse> =>
  customFetch<GetStandardScriptBlocksResponse>("/api/chatbot/script/standard", {
    method: "GET",
    ...options,
  });

export const useGetStandardScriptBlocks = <TError = unknown>(options?: {
  query?: UseQueryOptions<GetStandardScriptBlocksResponse, TError>;
}) =>
  useQuery<GetStandardScriptBlocksResponse, TError>({
    queryKey: ["/api/chatbot/script/standard"],
    queryFn: ({ signal }) => getStandardScriptBlocks({ signal }),
    staleTime: Infinity,
    ...options?.query,
  });

export const parseScript = (text: string): Promise<ParseScriptResponse> =>
  customFetch<ParseScriptResponse>("/api/chatbot/script/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

export const useParseScript = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<ParseScriptResponse, TError, string>;
}) =>
  useMutation<ParseScriptResponse, TError, string>({
    mutationFn: (text) => parseScript(text),
    ...options?.mutation,
  });

// ─── AI Migration ─────────────────────────────────────────────────────────────

import type {
  AiAnalyzeRequest,
  AiAnalyzeResponse,
  AiConfirmRequest,
  MigrationJobResponse,
} from "./generated/api.schemas";

export const analyzeFileWithAi = (
  data: AiAnalyzeRequest,
  options?: RequestInit,
): Promise<AiAnalyzeResponse> =>
  customFetch<AiAnalyzeResponse>("/api/migration/ai/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    ...options,
  });

export const useAnalyzeFileWithAi = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<AiAnalyzeResponse, TError, AiAnalyzeRequest>;
}) =>
  useMutation<AiAnalyzeResponse, TError, AiAnalyzeRequest>({
    mutationFn: (data) => analyzeFileWithAi(data),
    ...options?.mutation,
  });

export const confirmAiImport = (
  data: AiConfirmRequest,
  options?: RequestInit,
): Promise<MigrationJobResponse> =>
  customFetch<MigrationJobResponse>("/api/migration/ai/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    ...options,
  });

export const useConfirmAiImport = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<MigrationJobResponse, TError, AiConfirmRequest>;
}) =>
  useMutation<MigrationJobResponse, TError, AiConfirmRequest>({
    mutationFn: (data) => confirmAiImport(data),
    ...options?.mutation,
  });

// ─── Contracts ────────────────────────────────────────────────────────────────

export interface FieldMapping {
  placeholder: string;
  patientField: string;
  label: string;
}

export interface ContractTemplate {
  id: string;
  clinicId: string;
  name: string;
  fileUrl: string;
  fileType: string;
  extractedText: string | null;
  fieldMappings: FieldMapping[];
  isSystem: boolean;
  systemType: string | null;
  category?: string;
  subcategory?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientContract {
  id: string;
  clinicId: string;
  patientId: string;
  templateId: string;
  sentById: string | null;
  token: string;
  bundleToken: string | null;
  renderedHtml: string | null;
  filledData: Record<string, string>;
  status: "created" | "sent" | "viewed" | "signed";
  signedAt: string | null;
  signedIp: string | null;
  createdAt: string;
  templateName: string;
  sentByName: string | null;
}

export interface UploadTemplateResponse {
  success: boolean;
  data: {
    template: ContractTemplate;
    patientFields: { field: string; label: string }[];
  };
}

export interface SendContractResponse {
  success: boolean;
  data: { contract: PatientContract; contractUrl: string };
}

export const listContractTemplates = (): Promise<{
  success: boolean;
  data: { templates: ContractTemplate[] };
}> => customFetch("/api/contracts/templates");

export const getContractTemplate = (
  id: string,
): Promise<{ success: boolean; data: { template: ContractTemplate } }> =>
  customFetch(`/api/contracts/templates/${id}`);

export const useGetContractTemplate = <TError = unknown>(
  id: string | null,
  options?: {
    query?: UseQueryOptions<
      { success: boolean; data: { template: ContractTemplate } },
      TError
    >;
  },
) =>
  useQuery<{ success: boolean; data: { template: ContractTemplate } }, TError>({
    queryKey: ["contract-template", id],
    queryFn: () => getContractTemplate(id!),
    enabled: !!id,
    ...options?.query,
  });

export const useListContractTemplates = <TError = unknown>(options?: {
  query?: UseQueryOptions<
    { success: boolean; data: { templates: ContractTemplate[] } },
    TError
  >;
}) =>
  useQuery<
    { success: boolean; data: { templates: ContractTemplate[] } },
    TError
  >({
    queryKey: ["contract-templates"],
    queryFn: listContractTemplates,
    ...options?.query,
  });

export const uploadContractTemplate = (
  formData: FormData,
): Promise<UploadTemplateResponse> =>
  customFetch("/api/contracts/templates/upload", {
    method: "POST",
    body: formData,
  });

export const useUploadContractTemplate = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<UploadTemplateResponse, TError, FormData>;
}) =>
  useMutation<UploadTemplateResponse, TError, FormData>({
    mutationFn: uploadContractTemplate,
    ...options?.mutation,
  });

export const deleteContractTemplate = (
  id: string,
): Promise<{ success: boolean }> =>
  customFetch(`/api/contracts/templates/${id}`, { method: "DELETE" });

export const useDeleteContractTemplate = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<{ success: boolean }, TError, string>;
}) =>
  useMutation<{ success: boolean }, TError, string>({
    mutationFn: deleteContractTemplate,
    ...options?.mutation,
  });

export const listPatientContracts = (
  patientId: string,
): Promise<{ success: boolean; data: { contracts: PatientContract[] } }> =>
  customFetch(`/api/contracts/patient/${patientId}`);

export const useListPatientContracts = <TError = unknown>(
  patientId: string,
  options?: {
    query?: UseQueryOptions<
      { success: boolean; data: { contracts: PatientContract[] } },
      TError
    >;
  },
) =>
  useQuery<
    { success: boolean; data: { contracts: PatientContract[] } },
    TError
  >({
    queryKey: ["patient-contracts", patientId],
    queryFn: () => listPatientContracts(patientId),
    enabled: !!patientId,
    ...options?.query,
  });

export const sendContract = (
  patientId: string,
  templateId: string,
): Promise<SendContractResponse> =>
  customFetch(`/api/contracts/patient/${patientId}/send`, {
    method: "POST",
    body: JSON.stringify({ templateId }),
  });

export const useSendContract = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    SendContractResponse,
    TError,
    { patientId: string; templateId: string }
  >;
}) =>
  useMutation<
    SendContractResponse,
    TError,
    { patientId: string; templateId: string }
  >({
    mutationFn: ({ patientId, templateId }) =>
      sendContract(patientId, templateId),
    ...options?.mutation,
  });

export interface FieldMappingItem {
  placeholder: string;
  patientField: string;
  label: string;
}

export const updateTemplateMappings = (
  id: string,
  fieldMappings: FieldMappingItem[],
): Promise<{ success: boolean; data: { template: ContractTemplate } }> =>
  customFetch(`/api/contracts/templates/${id}/mappings`, {
    method: "PATCH",
    body: JSON.stringify({ fieldMappings }),
  });

export const useUpdateTemplateMappings = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    { success: boolean; data: { template: ContractTemplate } },
    TError,
    { id: string; fieldMappings: FieldMappingItem[] }
  >;
}) =>
  useMutation<
    { success: boolean; data: { template: ContractTemplate } },
    TError,
    { id: string; fieldMappings: FieldMappingItem[] }
  >({
    mutationFn: ({ id, fieldMappings }) =>
      updateTemplateMappings(id, fieldMappings),
    ...options?.mutation,
  });

export interface SendExtractionBundleResponse {
  success: boolean;
  data: {
    bundleToken: string;
    bundleUrl: string;
    contracts: PatientContract[];
  };
}

export const sendExtractionBundle = (
  patientId: string,
  serviceNames: string[],
): Promise<SendExtractionBundleResponse> =>
  customFetch(`/api/contracts/patient/${patientId}/send-extraction-bundle`, {
    method: "POST",
    body: JSON.stringify({ serviceNames }),
  });

export const useSendExtractionBundle = <TError = unknown>(options?: {
  mutation?: UseMutationOptions<
    SendExtractionBundleResponse,
    TError,
    { patientId: string; serviceNames: string[] }
  >;
}) =>
  useMutation<
    SendExtractionBundleResponse,
    TError,
    { patientId: string; serviceNames: string[] }
  >({
    mutationFn: ({ patientId, serviceNames }) =>
      sendExtractionBundle(patientId, serviceNames),
    ...options?.mutation,
  });

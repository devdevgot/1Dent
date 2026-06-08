import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface PatientTreatmentProgress {
  /** Completed and paid (green) */
  paid: number;
  /** Completed but in debt / awaiting payment (yellow) */
  debt: number;
  /** Not yet completed per treatment plan (red) */
  pending: number;
  paidCount: number;
  debtCount: number;
  pendingCount: number;
}

type ProgressSummary = Record<string, PatientTreatmentProgress>;

async function fetchTreatmentProgress(): Promise<ProgressSummary> {
  const res = await customFetch<{
    success: boolean;
    data: { summary: ProgressSummary };
  }>("/api/patients/treatment-progress");
  return res.data?.summary ?? {};
}

export function usePatientTreatmentProgress() {
  return useQuery({
    queryKey: ["patient-treatment-progress"],
    queryFn: fetchTreatmentProgress,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

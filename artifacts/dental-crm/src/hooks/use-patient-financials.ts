import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface PatientFinancial {
  paid: number;
  debt: number;
  remaining: number;
}

type FinancialSummary = Record<string, PatientFinancial>;

async function fetchFinancialSummary(): Promise<FinancialSummary> {
  const res = await customFetch<{ success: boolean; data: { summary: FinancialSummary } }>(
    "/api/patients/financial-summary",
  );
  return res.data?.summary ?? {};
}

export function usePatientFinancials() {
  return useQuery({
    queryKey: ["patient-financial-summary"],
    queryFn: fetchFinancialSummary,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

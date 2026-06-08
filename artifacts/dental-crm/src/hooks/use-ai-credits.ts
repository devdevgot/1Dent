import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface AiCreditsSummary {
  monthlyLimit: number;
  bonusCredits: number;
  totalAvailable: number;
  usedThisMonth: number;
  remaining: number;
  exhausted: boolean;
  plan: string;
  monthLabel: string;
}

export interface AiCreditUsageRow {
  id: string;
  feature: string;
  featureLabel: string;
  credits: number;
  description: string | null;
  userName: string | null;
  createdAt: string;
}

export function useAiCreditsSummary() {
  return useQuery({
    queryKey: ["ai-credits", "summary"],
    queryFn: async () => {
      const res = await customFetch<{ success: boolean; data: { summary: AiCreditsSummary } }>(
        "/api/ai-credits/summary",
      );
      return res.data.summary;
    },
    refetchInterval: 30_000,
  });
}

export function useAiCreditsUsage(limit = 50) {
  return useQuery({
    queryKey: ["ai-credits", "usage", limit],
    queryFn: async () => {
      const res = await customFetch<{ success: boolean; data: { usage: AiCreditUsageRow[] } }>(
        `/api/ai-credits/usage?limit=${limit}`,
      );
      return res.data.usage;
    },
    refetchInterval: 30_000,
  });
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { haptic, hapticNotify, useTgBackButton } from "../hooks/useTgBackButton";

interface PlanLimits {
  staff: number;
  branches: number;
  aiCredits: number;
  chatbotDialogs: number;
  documentTemplates: number | null;
}

interface PlanEntry {
  id: string;
  name: string;
  price: number;
  subtitle: string;
  audience: string;
  badge?: string;
  recommended?: boolean;
  highlights: string[];
  limits: PlanLimits;
}

interface PlansConfig {
  implementationFee: number;
  trialDays: number;
  plans: PlanEntry[];
}

function fmt(n: number) {
  return n.toLocaleString("ru-KZ");
}

export default function PlatformPlansPage() {
  const navigate = useNavigate();
  useTgBackButton(() => navigate("/content"));
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tma-platform-plans"],
    queryFn: () => api.get<{ success: boolean; data: PlansConfig }>("/platform/plans"),
  });

  const config = data?.data;
  const [draft, setDraft] = useState<PlansConfig | null>(null);
  const working = draft ?? config;

  const save = useMutation({
    mutationFn: (body: PlansConfig) => api.patch("/platform/plans", body),
    onSuccess: () => {
      hapticNotify("success");
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["tma-platform-plans"] });
    },
    onError: () => hapticNotify("error"),
  });

  const updatePlan = (id: string, patch: Partial<PlanEntry>) => {
    if (!working) return;
    setDraft({
      ...working,
      plans: working.plans.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  };

  const updateLimit = (planId: string, key: keyof PlanLimits, raw: string) => {
    if (!working) return;
    const val = key === "documentTemplates" && raw.trim() === "∞"
      ? null
      : Number(raw.replace(/\D/g, ""));
    updatePlan(planId, {
      limits: {
        ...working.plans.find((p) => p.id === planId)!.limits,
        [key]: key === "documentTemplates" ? (raw.trim() === "∞" ? null : val) : val,
      },
    });
  };

  if (isLoading || !working) {
    return <div className="p-6 text-sm text-muted-foreground">Загрузка тарифов...</div>;
  }

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Тарифы</h1>
        <p className="text-sm text-muted-foreground">Цены и лимиты применяются ко всем клиникам</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">Общие параметры</p>
        <label className="block text-xs text-muted-foreground">Внедрение (₸)</label>
        <input
          type="number"
          value={working.implementationFee}
          onChange={(e) => setDraft({ ...working, implementationFee: Number(e.target.value) })}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <label className="block text-xs text-muted-foreground">Пробный период (дней)</label>
        <input
          type="number"
          value={working.trialDays}
          onChange={(e) => setDraft({ ...working, trialDays: Number(e.target.value) })}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      {working.plans.map((plan) => (
        <div key={plan.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">{plan.name}</p>
            {plan.recommended && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">Рекомендуемый</span>
            )}
          </div>
          <input
            value={plan.name}
            onChange={(e) => updatePlan(plan.id, { name: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Название"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Цена / мес (₸)</label>
              <input
                type="number"
                value={plan.price}
                onChange={(e) => updatePlan(plan.id, { price: Number(e.target.value) })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Сотрудники</label>
              <input
                type="number"
                value={plan.limits.staff}
                onChange={(e) => updateLimit(plan.id, "staff", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Филиалы</label>
              <input
                type="number"
                value={plan.limits.branches}
                onChange={(e) => updateLimit(plan.id, "branches", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">AI-кредиты</label>
              <input
                type="number"
                value={plan.limits.aiCredits}
                onChange={(e) => updateLimit(plan.id, "aiCredits", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Диалоги бота</label>
              <input
                type="number"
                value={plan.limits.chatbotDialogs}
                onChange={(e) => updateLimit(plan.id, "chatbotDialogs", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Шаблоны (∞)</label>
              <input
                value={plan.limits.documentTemplates == null ? "∞" : plan.limits.documentTemplates}
                onChange={(e) => updateLimit(plan.id, "documentTemplates", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{plan.subtitle} · {fmt(plan.price)} ₸/мес</p>
        </div>
      ))}

      <button
        type="button"
        disabled={!draft || save.isPending}
        onClick={() => { haptic("medium"); save.mutate(working); }}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
      >
        {save.isPending ? "Сохранение..." : "Сохранить тарифы"}
      </button>
    </div>
  );
}

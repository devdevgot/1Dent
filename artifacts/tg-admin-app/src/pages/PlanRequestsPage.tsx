import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { haptic, hapticNotify, tgAlert } from "../hooks/useTgBackButton";
import { TmaPage } from "@/components/layout/tma-page";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PlanRequest {
  id: string;
  clinic_id: string;
  clinic_name: string | null;
  plan: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400",
  approved: "bg-green-500/20 text-green-400",
  rejected: "bg-red-500/20 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает",
  approved: "Одобрена",
  rejected: "Отклонена",
};

const PLAN_LABELS: Record<string, string> = {
  starter: "START",
  professional: "PRO",
  enterprise: "ENTERPRISE",
};

const SUBSCRIPTION_MONTH_OPTIONS = [
  { value: 1, label: "1 месяц" },
  { value: 3, label: "3 месяца" },
  { value: 6, label: "6 месяцев" },
  { value: 12, label: "1 год" },
  { value: 24, label: "2 года" },
  { value: 36, label: "3 года" },
  { value: 60, label: "5 лет" },
  { value: 120, label: "10 лет" },
] as const;

export default function PlanRequestsPage() {
  const qc = useQueryClient();
  const [approvingRequest, setApprovingRequest] = useState<PlanRequest | null>(null);
  const [months, setMonths] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["tma-plan-requests"],
    queryFn: () => api.get<{ success: boolean; data: { requests: PlanRequest[] } }>("/plan-requests"),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => api.patch(`/plan-requests/${id}`, { status: "rejected" }),
    onSuccess: () => {
      hapticNotify("success");
      qc.invalidateQueries({ queryKey: ["tma-plan-requests"] });
    },
    onError: (err: Error) => {
      hapticNotify("error");
      tgAlert(err.message || "Не удалось отклонить заявку");
    },
  });

  const approveMut = useMutation({
    mutationFn: async ({ request, months: selectedMonths }: { request: PlanRequest; months: number }) => {
      await api.post(`/clinics/${request.clinic_id}/set-subscription`, {
        plan: request.plan,
        months: selectedMonths,
      });
      await api.patch(`/plan-requests/${request.id}`, { status: "approved" });
    },
    onSuccess: (_data, { request, months: selectedMonths }) => {
      hapticNotify("success");
      qc.invalidateQueries({ queryKey: ["tma-plan-requests"] });
      qc.invalidateQueries({ queryKey: ["tma-clinics"] });
      qc.invalidateQueries({ queryKey: ["tma-clinic-detail", request.clinic_id] });
      setApprovingRequest(null);
      setMonths(1);
      tgAlert(`Подписка ${(PLAN_LABELS[request.plan] ?? request.plan).toUpperCase()} на ${selectedMonths} мес. активирована`);
    },
    onError: (err: Error) => {
      hapticNotify("error");
      tgAlert(err.message || "Не удалось одобрить заявку");
    },
  });

  const requests = data?.data?.requests ?? [];
  const pending = requests.filter((r) => r.status === "pending");
  const processed = requests.filter((r) => r.status !== "pending");

  if (isLoading) {
    return (
      <TmaPage title="Заявки на подключение" withTabBarOffset>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 bg-white rounded-xl animate-pulse" />
          ))}
        </div>
      </TmaPage>
    );
  }

  return (
    <TmaPage title="Заявки на подключение" withTabBarOffset>

      {requests.length === 0 && (
        <EmptyState text="Заявок пока нет" />
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Новые ({pending.length})
          </p>
          {pending.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              onApprove={() => {
                haptic("medium");
                setMonths(1);
                setApprovingRequest(r);
              }}
              onReject={() => {
                haptic("medium");
                rejectMut.mutate(r.id);
              }}
            />
          ))}
        </div>
      )}

      {processed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Обработанные ({processed.length})
          </p>
          {processed.map((r) => (
            <RequestCard key={r.id} request={r} />
          ))}
        </div>
      )}

      <Dialog
        open={approvingRequest !== null}
        onOpenChange={(open) => {
          if (!open && !approveMut.isPending) {
            setApprovingRequest(null);
            setMonths(1);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Одобрить заявку</DialogTitle>
            <DialogDescription>
              Выберите срок действия тарифа для клиники
              {approvingRequest?.clinic_name ? ` «${approvingRequest.clinic_name}»` : ""}.
            </DialogDescription>
          </DialogHeader>

          {approvingRequest && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Тариф</p>
                <p className="text-sm font-semibold text-foreground">
                  {PLAN_LABELS[approvingRequest.plan] ?? approvingRequest.plan}
                </p>
              </div>

              <div>
                <label htmlFor="subscription-months" className="text-xs text-muted-foreground mb-1.5 block">
                  Срок подписки
                </label>
                <select
                  id="subscription-months"
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
                >
                  {SUBSCRIPTION_MONTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => {
                if (!approveMut.isPending) {
                  setApprovingRequest(null);
                  setMonths(1);
                }
              }}
              disabled={approveMut.isPending}
              className="w-full sm:w-auto px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => {
                if (approvingRequest) {
                  haptic("medium");
                  approveMut.mutate({ request: approvingRequest, months });
                }
              }}
              disabled={!approvingRequest || approveMut.isPending}
              className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {approveMut.isPending ? "Активация..." : "Активировать"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TmaPage>
  );
}

function RequestCard({
  request: r,
  onApprove,
  onReject,
}: {
  request: PlanRequest;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground text-sm">{r.contact_name}</p>
          <p className="text-xs text-muted-foreground">{r.contact_phone}</p>
          {r.contact_email && <p className="text-xs text-muted-foreground">{r.contact_email}</p>}
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] ?? ""}`}>
          {STATUS_LABELS[r.status] ?? r.status}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
          {PLAN_LABELS[r.plan] ?? r.plan}
        </span>
        {r.clinic_name && (
          <span className="text-xs text-muted-foreground">
            {r.clinic_name}
          </span>
        )}
      </div>

      {r.message && (
        <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
          {r.message}
        </p>
      )}

      <p className="text-[10px] text-muted-foreground">
        {new Date(r.created_at).toLocaleString("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </p>

      {onApprove && onReject && r.status === "pending" && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={onApprove}
            className="flex-1 py-2 bg-green-500/20 text-green-400 rounded-lg text-xs font-semibold hover:bg-green-500/30"
          >
            Одобрить
          </button>
          <button
            onClick={onReject}
            className="flex-1 py-2 bg-red-500/20 text-red-400 rounded-lg text-xs font-semibold hover:bg-red-500/30"
          >
            Отклонить
          </button>
        </div>
      )}
    </div>
  );
}

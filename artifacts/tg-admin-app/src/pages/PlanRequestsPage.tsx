import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { haptic, hapticNotify } from "../hooks/useTgBackButton";

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

export default function PlanRequestsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["tma-plan-requests"],
    queryFn: () => api.get<{ success: boolean; data: { requests: PlanRequest[] } }>("/plan-requests"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/plan-requests/${id}`, { status }),
    onSuccess: () => {
      hapticNotify("success");
      qc.invalidateQueries({ queryKey: ["tma-plan-requests"] });
    },
  });

  const requests = data?.data?.requests ?? [];
  const pending = requests.filter((r) => r.status === "pending");
  const processed = requests.filter((r) => r.status !== "pending");

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 bg-card rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold text-foreground">📋 Заявки на подключение</h1>

      {requests.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Заявок пока нет
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Новые ({pending.length})
          </p>
          {pending.map((r) => (
            <RequestCard key={r.id} request={r} onAction={(status) => {
              haptic("medium");
              updateMut.mutate({ id: r.id, status });
            }} />
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
    </div>
  );
}

function RequestCard({ request: r, onAction }: { request: PlanRequest; onAction?: (status: string) => void }) {
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
          {r.plan}
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

      {onAction && r.status === "pending" && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onAction("approved")}
            className="flex-1 py-2 bg-green-500/20 text-green-400 rounded-lg text-xs font-semibold hover:bg-green-500/30"
          >
            ✓ Одобрить
          </button>
          <button
            onClick={() => onAction("rejected")}
            className="flex-1 py-2 bg-red-500/20 text-red-400 rounded-lg text-xs font-semibold hover:bg-red-500/30"
          >
            ✕ Отклонить
          </button>
        </div>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { api, type DashboardData, type Clinic } from "../lib/api";
import { useApp } from "../App";

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="bg-card rounded-xl p-4 border border-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}

function ClinicItem({ clinic, onSelect }: { clinic: Clinic; onSelect: () => void }) {
  const planColors: Record<string, string> = {
    free: "bg-muted-foreground/20 text-muted-foreground",
    starter: "bg-blue-500/20 text-blue-400",
    professional: "bg-purple-500/20 text-purple-400",
    enterprise: "bg-amber-500/20 text-amber-400",
  };
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-3 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
        {clinic.name[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{clinic.name}</p>
        <p className="text-xs text-muted-foreground">
          {clinic.usersCount ?? 0} польз · {clinic.patientsCount ?? 0} пац
        </p>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${planColors[clinic.plan] ?? planColors.free}`}>
        {clinic.plan}
      </span>
    </button>
  );
}

export default function Dashboard() {
  const { setTab } = useApp();
  const { data, isLoading } = useQuery({
    queryKey: ["tma-dashboard"],
    queryFn: () => api.get<{ success: boolean; data: DashboardData }>("/dashboard"),
  });

  const d = data?.data;

  const formatMoney = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M ₸`
      : n >= 1_000
      ? `${(n / 1_000).toFixed(0)}K ₸`
      : `${n.toFixed(0)} ₸`;

  return (
    <div className="px-4 pt-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">1Dent</h1>
        <p className="text-sm text-muted-foreground">Платформенная панель</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl p-4 border border-border h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Клиники" value={d?.totalClinics ?? 0} icon="🏥" />
          <StatCard label="Сотрудники" value={d?.totalUsers ?? 0} icon="👥" />
          <StatCard label="Пациенты" value={d?.totalPatients ?? 0} icon="🦷" />
          <StatCard label="Выручка / мес" value={d ? formatMoney(d.revenueThisMonth) : "—"} icon="💰" />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground">Последние клиники</h2>
          <button onClick={() => setTab("clinics")} className="text-xs text-primary">Все →</button>
        </div>
        <div className="space-y-2">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 bg-card rounded-lg border border-border animate-pulse" />
              ))
            : (d?.recentClinics ?? []).map((c) => (
                <ClinicItem key={c.id} clinic={c} onSelect={() => setTab("clinics")} />
              ))}
        </div>
      </div>

      <div className="bg-accent/30 rounded-xl p-4 border border-accent/50">
        <p className="text-xs text-accent-foreground">
          💬 Всего chatbot-сессий: <strong>{d?.totalChatbotSessions ?? 0}</strong>
        </p>
      </div>
    </div>
  );
}

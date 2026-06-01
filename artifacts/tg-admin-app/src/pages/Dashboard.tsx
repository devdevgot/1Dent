import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { haptic } from "../hooks/useTgBackButton";

interface DashboardData {
  totalClinics: number;
  totalUsers: number;
  totalPatients: number;
  revenueThisMonth: number;
  totalChatbotSessions: number;
  todayMessages: number;
  totalChannels: number;
  activeBots: number;
  top5ByActivity: { id: string; name: string; plan: string; isActive: boolean; activityScore: number }[];
  recentClinics: { id: string; name: string; plan: string; createdAt: string }[];
}

function StatCard({ label, value, icon, sub }: { label: string; value: string | number; icon: string; sub?: string }) {
  return (
    <div className="bg-card rounded-xl p-4 border border-border">
      <div className="flex items-center justify-between mb-1">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

const planColors: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  starter: "bg-blue-500/20 text-blue-400",
  professional: "bg-purple-500/20 text-purple-400",
  enterprise: "bg-amber-500/20 text-amber-400",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["tma-dashboard"],
    queryFn: () => api.get<{ success: boolean; data: DashboardData }>("/dashboard"),
  });

  const d = data?.data;

  const fmt = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M ₸`
    : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K ₸`
    : `${n.toFixed(0)} ₸`;

  return (
    <div className="px-4 pt-6 space-y-5 pb-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">1Dent</h1>
        <p className="text-sm text-muted-foreground">Платформенная суперадминка</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl p-4 border border-border h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Клиники" value={d?.totalClinics ?? 0} icon="🏥" />
            <StatCard label="Сотрудники" value={d?.totalUsers ?? 0} icon="👥" />
            <StatCard label="Пациенты" value={d?.totalPatients ?? 0} icon="🦷" />
            <StatCard label="Выручка / мес" value={d ? fmt(d.revenueThisMonth) : "—"} icon="💰" />
            <StatCard label="Боты сегодня" value={d?.todayMessages ?? 0} icon="💬" sub="сообщений" />
            <StatCard label="Каналы" value={d?.totalChannels ?? 0} icon="📡" />
            <StatCard label="Активных ботов" value={d?.activeBots ?? 0} icon="🤖" />
            <StatCard label="Сессий всего" value={d?.totalChatbotSessions ?? 0} icon="📊" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-foreground">Топ-5 по активности (7 дней)</h2>
            </div>
            <div className="space-y-2">
              {(d?.top5ByActivity ?? []).map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => { haptic("light"); navigate(`/clinics/${c.id}`); }}
                  className="w-full flex items-center gap-3 p-3 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors text-left"
                >
                  <span className="text-muted-foreground text-sm font-mono w-4">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.activityScore} действий</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${planColors[c.plan] ?? planColors["free"]}`}>{c.plan}</span>
                </button>
              ))}
              {!(d?.top5ByActivity ?? []).length && (
                <p className="text-sm text-muted-foreground text-center py-4">Нет данных</p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-foreground">Последние клиники</h2>
              <button onClick={() => { haptic("light"); navigate("/clinics"); }} className="text-xs text-primary">Все →</button>
            </div>
            <div className="space-y-2">
              {(d?.recentClinics ?? []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => { haptic("light"); navigate(`/clinics/${c.id}`); }}
                  className="w-full flex items-center gap-3 p-3 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("ru")}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${planColors[c.plan] ?? planColors["free"]}`}>{c.plan}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { haptic } from "../hooks/useTgBackButton";
import { TmaPage } from "@/components/layout/tma-page";
import { SectionIcon, SectionIconBox, type SectionIconName } from "@/components/section-icons";
import { EmptyState } from "@/components/empty-state";

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

function StatCard({ label, value, icon, sub }: { label: string; value: string | number; icon: SectionIconName; sub?: string }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-[#e8e3d9]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[#64748b] text-xs">{label}</span>
        <SectionIcon name={icon} className="w-4 h-4 text-[#1f75fe]" />
      </div>
      <div className="text-2xl font-bold text-[#0f172a]">{value}</div>
      {sub && <div className="text-xs text-[#64748b] mt-0.5">{sub}</div>}
    </div>
  );
}

const planColors: Record<string, string> = {
  free: "bg-[#f1ede4] text-[#64748b]",
  starter: "bg-blue-50 text-blue-700",
  professional: "bg-purple-50 text-purple-700",
  enterprise: "bg-amber-50 text-amber-800",
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
    <TmaPage
      title="1Dent"
      subtitle="Платформенная суперадминка"
      withTabBarOffset
      contentClassName="px-4 pt-4 pb-4 space-y-5"
    >
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-[#e8e3d9] h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Клиники" value={d?.totalClinics ?? 0} icon="clinics" />
            <StatCard label="Сотрудники" value={d?.totalUsers ?? 0} icon="users" />
            <StatCard label="Пациенты" value={d?.totalPatients ?? 0} icon="patients" />
            <StatCard label="Выручка / мес" value={d ? fmt(d.revenueThisMonth) : "—"} icon="finances" />
            <StatCard label="Боты сегодня" value={d?.todayMessages ?? 0} icon="sessions" sub="сообщений" />
            <StatCard label="Каналы" value={d?.totalChannels ?? 0} icon="channels" />
            <StatCard label="Активных ботов" value={d?.activeBots ?? 0} icon="chatbot" />
            <StatCard label="Сессий всего" value={d?.totalChatbotSessions ?? 0} icon="analytics" />
          </div>

          <button
            type="button"
            onClick={() => { haptic("light"); navigate("/content"); }}
            className="w-full flex items-center gap-3 rounded-2xl border border-[#e8e3d9] bg-white p-4 text-left shadow-sm active:bg-[#f1ede4] transition-colors"
          >
            <SectionIconBox name="content" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#0f172a]">Контент платформы</p>
              <p className="text-xs text-[#64748b]">Тарифы, договоры, чатбот, видео планшета</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[#94a3b8]" />
          </button>

          <div>
            <h2 className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-2.5 px-1">Топ-5 по активности (7 дней)</h2>
            <div className="space-y-2">
              {(d?.top5ByActivity ?? []).map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => { haptic("light"); navigate(`/clinics/${c.id}`); }}
                  className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-[#e8e3d9] hover:border-[#1f75fe]/40 transition-colors text-left"
                >
                  <span className="text-[#94a3b8] text-sm font-mono w-4">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0f172a] truncate">{c.name}</p>
                    <p className="text-xs text-[#64748b]">{c.activityScore} действий</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${planColors[c.plan] ?? planColors["free"]}`}>{c.plan}</span>
                </button>
              ))}
              {!(d?.top5ByActivity ?? []).length && (
                <p className="text-sm text-[#64748b] text-center py-4">Нет данных</p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-[#64748b] uppercase tracking-wide px-1">Последние клиники</h2>
              <button onClick={() => { haptic("light"); navigate("/clinics"); }} className="text-xs text-[#1f75fe]">Все</button>
            </div>
            <div className="space-y-2">
              {(d?.recentClinics ?? []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => { haptic("light"); navigate(`/clinics/${c.id}`); }}
                  className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-[#e8e3d9] text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-[var(--primary-light)] flex items-center justify-center text-[#1f75fe] font-bold text-sm shrink-0">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0f172a] truncate">{c.name}</p>
                    <p className="text-xs text-[#64748b]">{new Date(c.createdAt).toLocaleDateString("ru")}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${planColors[c.plan] ?? planColors["free"]}`}>{c.plan}</span>
                </button>
              ))}
              {!(d?.recentClinics ?? []).length && (
                <p className="text-sm text-[#64748b] text-center py-4">Нет данных</p>
              )}
            </div>
          </div>
        </>
      )}
    </TmaPage>
  );
}

import { useTranslation } from "react-i18next";
import { BarChart3, TrendingUp, Users, CalendarCheck } from "lucide-react";
import { useGetChatbotFunnelAnalytics } from "@workspace/api-client-react";
import { FSM_STATE_LABELS } from "@/lib/chatbot-fsm-states";
import { cn } from "@/lib/utils";

export function ChatbotAnalyticsTab() {
  const { t } = useTranslation();
  const { data, isLoading } = useGetChatbotFunnelAnalytics(30);
  const analytics = data?.data?.analytics;

  if (isLoading) {
    return <div className="p-8 text-center text-body text-[var(--text-secondary)]">{t("common.loading")}</div>;
  }

  if (!analytics) {
    return (
      <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--bg)] p-10 text-center">
        <BarChart3 className="h-8 w-8 text-[var(--text-subtle)]/40 mx-auto mb-2" />
        <p className="text-body text-[var(--text-secondary)]">Нет данных за период</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Сессии", value: analytics.totalSessions, icon: Users },
          { label: "Записи", value: analytics.totalBookings, icon: CalendarCheck },
          { label: "Конверсия", value: `${analytics.overallBookingRate}%`, icon: TrendingUp },
          { label: "Период", value: `${analytics.periodDays} дн.`, icon: BarChart3 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4">
            <div className="flex items-center gap-2 text-[var(--text-secondary)] mb-1">
              <Icon className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-bold text-[var(--text)]">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--ds-border)]">
          <h3 className="text-body font-semibold text-[var(--text)]">Воронка по этапам FSM</h3>
          <p className="text-caption text-[var(--text-secondary)] mt-0.5">Сколько пациентов дошло до каждого шага</p>
        </div>
        <div className="divide-y divide-[#e8e3d9]">
          {analytics.stages
            .filter((s) => s.entered > 0 || ["greeting", "collect_problem", "suggest_doctor", "collect_datetime"].includes(s.state))
            .map((stage) => (
              <div key={stage.state} className="px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-body font-medium truncate text-[var(--text)]">
                    {FSM_STATE_LABELS[stage.state] ?? stage.state}
                  </p>
                  <p className="text-caption text-[var(--text-secondary)]">
                    {stage.entered} вошли · {stage.progressed} перешли дальше
                  </p>
                </div>
                <div className="w-28 shrink-0">
                  <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div
                      className={cn("h-full rounded-full bg-[#1f75fe] transition-all")}
                      style={{ width: `${Math.min(100, stage.conversionRate)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] text-right mt-0.5">{stage.conversionRate}%</p>
                </div>
              </div>
            ))}
        </div>
      </div>

      {analytics.variants.length > 0 && (
        <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--ds-border)]">
            <h3 className="text-body font-semibold text-[var(--text)]">A/B тест скриптов</h3>
            <p className="text-caption text-[var(--text-secondary)] mt-0.5">Сравнение вариантов по конверсии в запись</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-caption text-[var(--text-secondary)] border-b border-[var(--ds-border)]">
                  <th className="px-4 py-2 font-medium">Вариант</th>
                  <th className="px-4 py-2 font-medium">Сессии</th>
                  <th className="px-4 py-2 font-medium">Записи</th>
                  <th className="px-4 py-2 font-medium">Конверсия</th>
                  <th className="px-4 py-2 font-medium">Handoff</th>
                </tr>
              </thead>
              <tbody>
                {analytics.variants.map((v) => (
                  <tr key={v.variantId} className="border-b border-[var(--ds-border)]/50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-[var(--text)]">{v.variantName}</td>
                    <td className="px-4 py-2.5 text-[var(--text)]">{v.sessions}</td>
                    <td className="px-4 py-2.5 text-[var(--text)]">{v.bookings}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        "text-caption font-semibold px-2 py-0.5 rounded-full",
                        v.bookingRate >= analytics.overallBookingRate
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700",
                      )}>
                        {v.bookingRate}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{v.handoffs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

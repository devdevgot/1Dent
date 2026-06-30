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
    return <div className="p-8 text-center text-sm text-[#64748b]">{t("common.loading")}</div>;
  }

  if (!analytics) {
    return (
      <div className="rounded-2xl border border-[#e8e3d9] bg-[#faf8f4] p-10 text-center">
        <BarChart3 className="h-8 w-8 text-[#94a3b8]/40 mx-auto mb-2" />
        <p className="text-sm text-[#64748b]">Нет данных за период</p>
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
          <div key={label} className="rounded-2xl border border-[#e8e3d9] bg-white p-4">
            <div className="flex items-center gap-2 text-[#64748b] mb-1">
              <Icon className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-bold text-[#0f172a]">{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[#e8e3d9] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e8e3d9]">
          <h3 className="text-sm font-semibold text-[#0f172a]">Воронка по этапам FSM</h3>
          <p className="text-xs text-[#64748b] mt-0.5">Сколько пациентов дошло до каждого шага</p>
        </div>
        <div className="divide-y divide-[#e8e3d9]">
          {analytics.stages
            .filter((s) => s.entered > 0 || ["greeting", "collect_problem", "suggest_doctor", "collect_datetime"].includes(s.state))
            .map((stage) => (
              <div key={stage.state} className="px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-[#0f172a]">
                    {FSM_STATE_LABELS[stage.state] ?? stage.state}
                  </p>
                  <p className="text-xs text-[#64748b]">
                    {stage.entered} вошли · {stage.progressed} перешли дальше
                  </p>
                </div>
                <div className="w-28 shrink-0">
                  <div className="h-2 rounded-full bg-[#f1ede4] overflow-hidden">
                    <div
                      className={cn("h-full rounded-full bg-[#1f75fe] transition-all")}
                      style={{ width: `${Math.min(100, stage.conversionRate)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-[#64748b] text-right mt-0.5">{stage.conversionRate}%</p>
                </div>
              </div>
            ))}
        </div>
      </div>

      {analytics.variants.length > 0 && (
        <div className="rounded-2xl border border-[#e8e3d9] bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e8e3d9]">
            <h3 className="text-sm font-semibold text-[#0f172a]">A/B тест скриптов</h3>
            <p className="text-xs text-[#64748b] mt-0.5">Сравнение вариантов по конверсии в запись</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#64748b] border-b border-[#e8e3d9]">
                  <th className="px-4 py-2 font-medium">Вариант</th>
                  <th className="px-4 py-2 font-medium">Сессии</th>
                  <th className="px-4 py-2 font-medium">Записи</th>
                  <th className="px-4 py-2 font-medium">Конверсия</th>
                  <th className="px-4 py-2 font-medium">Handoff</th>
                </tr>
              </thead>
              <tbody>
                {analytics.variants.map((v) => (
                  <tr key={v.variantId} className="border-b border-[#e8e3d9]/50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-[#0f172a]">{v.variantName}</td>
                    <td className="px-4 py-2.5 text-[#0f172a]">{v.sessions}</td>
                    <td className="px-4 py-2.5 text-[#0f172a]">{v.bookings}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        "text-xs font-semibold px-2 py-0.5 rounded-full",
                        v.bookingRate >= analytics.overallBookingRate
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700",
                      )}>
                        {v.bookingRate}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[#64748b]">{v.handoffs}</td>
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

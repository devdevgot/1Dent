import { useMemo } from "react";
import {
  Clock, AlertCircle, Circle, CalendarDays, CheckCircle2,
} from "lucide-react";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import type { Procedure } from "@workspace/api-client-react";
import "@/styles/dashboard.css";

interface Patient {
  id: string;
  name: string;
}

interface TasksBlockProps {
  procedures: Procedure[];
  patients: Patient[];
}

function getRefDate(proc: Procedure): Date {
  return proc.scheduledAt ? parseISO(proc.scheduledAt) : parseISO(proc.createdAt);
}

export function TasksBlock({ procedures, patients }: TasksBlockProps) {
  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const todayEnd = useMemo(() => endOfDay(new Date()), []);

  const todayScheduled = useMemo(() =>
    procedures
      .filter((p) => {
        if (!p.scheduledAt || p.status !== "scheduled") return false;
        const d = parseISO(p.scheduledAt);
        return d >= todayStart && d <= todayEnd;
      })
      .sort((a, b) => parseISO(a.scheduledAt!).getTime() - parseISO(b.scheduledAt!).getTime()),
  [procedures, todayStart, todayEnd]);

  const todayInProgress = useMemo(() =>
    procedures.filter((p) => {
      if ((p.status as string) !== "in_progress") return false;
      const d = getRefDate(p);
      return d >= todayStart && d <= todayEnd;
    }),
  [procedures, todayStart, todayEnd]);

  const todayPending = useMemo(() =>
    procedures
      .filter((p) => {
        if ((p.status as string) !== "pending_payment") return false;
        const d = getRefDate(p);
        return d >= todayStart && d <= todayEnd;
      })
      .sort((a, b) => getRefDate(a).getTime() - getRefDate(b).getTime()),
  [procedures, todayStart, todayEnd]);

  const todayCount = todayScheduled.length + todayInProgress.length + todayPending.length;
  const allClear = todayCount === 0;

  return (
    <>
      <div className="mx-4 mt-4 dashboard-page dash-card overflow-hidden">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-[#e8e3d9]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#1f75fe]" />
            <span className="text-sm font-bold text-[#0f172a]">Задачи за сегодня</span>
            {todayCount > 0 && (
              <span className="dash-badge dash-badge-warning">
                {todayCount}
              </span>
            )}
          </div>
          {allClear && (
            <div className="flex items-center gap-1 text-xs font-semibold text-[#16a34a]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Всё закрыто
            </div>
          )}
        </div>

        {todayCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-1.5">
            <CheckCircle2 className="w-8 h-8 text-[#16a34a] opacity-60" />
            <p className="text-sm font-medium text-[#64748b]">Нет задач на сегодня</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--ds-border)]">
            {todayPending.length > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertCircle className="w-3.5 h-3.5 text-[#dc2626]" />
                  <span className="text-xs font-bold text-[#dc2626] uppercase tracking-wide">Ожидают оплату</span>
                  <span className="dash-badge dash-badge-danger ml-auto">{todayPending.length}</span>
                </div>
                <div className="space-y-1.5">
                  {todayPending.slice(0, 4).map((proc) => {
                    const patient = patients.find((p) => p.id === proc.patientId);
                    return (
                      <div key={proc.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-[var(--danger-light)] border border-[var(--danger-light)]">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--danger)] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[#0f172a] truncate">{proc.name}</p>
                          <p className="text-xs text-[#64748b] truncate">
                            {patient?.name ?? "—"}{proc.doctorName ? ` · ${proc.doctorName}` : ""}
                          </p>
                        </div>
                        {proc.price != null && proc.price > 0 && (
                          <span className="text-xs font-bold text-[#dc2626] shrink-0">
                            {proc.price.toLocaleString("ru-RU")} ₸
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {todayPending.length > 4 && (
                    <p className="text-xs text-[#94a3b8] text-center pt-0.5">+ ещё {todayPending.length - 4}</p>
                  )}
                </div>
              </div>
            )}

            {todayInProgress.length > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Circle className="w-3.5 h-3.5 text-[#d97706]" />
                  <span className="text-xs font-bold text-[#d97706] uppercase tracking-wide">В работе</span>
                  <span className="dash-badge dash-badge-warning ml-auto">{todayInProgress.length}</span>
                </div>
                <div className="space-y-1.5">
                  {todayInProgress.slice(0, 4).map((proc) => {
                    const patient = patients.find((p) => p.id === proc.patientId);
                    return (
                      <div key={proc.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-[var(--warning-light)] border border-[var(--warning-light)]">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[#0f172a] truncate">{proc.name}</p>
                          <p className="text-xs text-[#64748b] truncate">
                            {patient?.name ?? "—"}{proc.doctorName ? ` · ${proc.doctorName}` : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {todayInProgress.length > 4 && (
                    <p className="text-xs text-[#94a3b8] text-center pt-0.5">+ ещё {todayInProgress.length - 4}</p>
                  )}
                </div>
              </div>
            )}

            {todayScheduled.length > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <CalendarDays className="w-3.5 h-3.5 text-[var(--info)]" />
                  <span className="text-xs font-bold text-[var(--info)] uppercase tracking-wide">Расписание на сегодня</span>
                  <span className="dash-badge dash-badge-primary ml-auto">{todayScheduled.length}</span>
                </div>
                <div className="space-y-1.5">
                  {todayScheduled.slice(0, 5).map((proc) => {
                    const patient = patients.find((p) => p.id === proc.patientId);
                    const timeStr = proc.scheduledAt ? format(parseISO(proc.scheduledAt), "HH:mm") : "—";
                    return (
                      <div key={proc.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-[var(--info-light)] border border-[var(--info-light)]">
                        <span className="text-xs font-bold text-[var(--info)] w-10 shrink-0">{timeStr}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[#0f172a] truncate">{proc.name}</p>
                          <p className="text-xs text-[#64748b] truncate">
                            {patient?.name ?? "—"}{proc.doctorName ? ` · ${proc.doctorName}` : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {todayScheduled.length > 5 && (
                    <p className="text-xs text-[#94a3b8] text-center pt-0.5">+ ещё {todayScheduled.length - 5}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

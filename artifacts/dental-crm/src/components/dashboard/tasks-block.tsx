import { useMemo } from "react";
import {
  Clock, AlertCircle, Circle, CalendarDays, CheckCircle2,
} from "lucide-react";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import type { Procedure } from "@workspace/api-client-react";

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
      {/* ─── Задачи за сегодня ─── */}
      <div className="mx-4 mt-4 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-gray-50">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-gray-900">Задачи за сегодня</span>
            {todayCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {todayCount}
              </span>
            )}
          </div>
          {allClear && (
            <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Всё закрыто
            </div>
          )}
        </div>

        {todayCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-1.5">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            <p className="text-sm font-medium text-gray-500">Нет задач на сегодня</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {todayPending.length > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                  <span className="text-xs font-bold text-rose-600 uppercase tracking-wide">Ожидают оплату</span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 ml-auto">{todayPending.length}</span>
                </div>
                <div className="space-y-1.5">
                  {todayPending.slice(0, 4).map((proc) => {
                    const patient = patients.find((p) => p.id === proc.patientId);
                    return (
                      <div key={proc.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-rose-50 border border-rose-100">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{proc.name}</p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {patient?.name ?? "—"}{proc.doctorName ? ` · ${proc.doctorName}` : ""}
                          </p>
                        </div>
                        {proc.price != null && proc.price > 0 && (
                          <span className="text-xs font-bold text-rose-700 shrink-0">
                            {proc.price.toLocaleString("ru-RU")} ₸
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {todayPending.length > 4 && (
                    <p className="text-[11px] text-gray-400 text-center pt-0.5">+ ещё {todayPending.length - 4}</p>
                  )}
                </div>
              </div>
            )}

            {todayInProgress.length > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Circle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">В работе</span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-auto">{todayInProgress.length}</span>
                </div>
                <div className="space-y-1.5">
                  {todayInProgress.slice(0, 4).map((proc) => {
                    const patient = patients.find((p) => p.id === proc.patientId);
                    return (
                      <div key={proc.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-amber-50 border border-amber-100">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{proc.name}</p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {patient?.name ?? "—"}{proc.doctorName ? ` · ${proc.doctorName}` : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {todayInProgress.length > 4 && (
                    <p className="text-[11px] text-gray-400 text-center pt-0.5">+ ещё {todayInProgress.length - 4}</p>
                  )}
                </div>
              </div>
            )}

            {todayScheduled.length > 0 && (
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <CalendarDays className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">Расписание на сегодня</span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 ml-auto">{todayScheduled.length}</span>
                </div>
                <div className="space-y-1.5">
                  {todayScheduled.slice(0, 5).map((proc) => {
                    const patient = patients.find((p) => p.id === proc.patientId);
                    const timeStr = proc.scheduledAt ? format(parseISO(proc.scheduledAt), "HH:mm") : "—";
                    return (
                      <div key={proc.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-blue-50 border border-blue-100">
                        <span className="text-xs font-bold text-blue-700 w-10 shrink-0">{timeStr}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{proc.name}</p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {patient?.name ?? "—"}{proc.doctorName ? ` · ${proc.doctorName}` : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {todayScheduled.length > 5 && (
                    <p className="text-[11px] text-gray-400 text-center pt-0.5">+ ещё {todayScheduled.length - 5}</p>
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

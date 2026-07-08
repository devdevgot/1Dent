import { useState, useMemo } from "react";
import { Clock, User, Stethoscope, AlertTriangle } from "lucide-react";
import {
  useListProcedures,
  useListPatients,
  useUpdateProcedureStatus,
} from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { AppDialog } from "@/components/layout/app-dialog";

export function AttendanceCheckModal() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const isAdmin = user?.role === "admin";

  const { data: proceduresData } = useListProcedures({
    query: { enabled: isAdmin, refetchInterval: 30000 },
  });
  const { data: patientsData } = useListPatients({
    query: { enabled: isAdmin },
  });

  const updateStatusMutation = useUpdateProcedureStatus();

  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());

  const procedures = proceduresData?.data?.procedures ?? [];
  const patients   = patientsData?.data?.patients ?? [];

  const patientMap = useMemo(() => {
    return new Map(patients.map((p) => [p.id, p.name]));
  }, [patients]);

  const dueProcedures = useMemo(() => {
    if (!isAdmin) return [];
    return procedures
      .filter((p) => {
        if (p.status !== "scheduled" || !p.scheduledAt) return false;
        if (answeredIds.has(p.id)) return false;
        const scheduledTime = new Date(p.scheduledAt).getTime();
        return scheduledTime <= Date.now();
      })
      .sort((a, b) => {
        const timeA = new Date(a.scheduledAt!).getTime();
        const timeB = new Date(b.scheduledAt!).getTime();
        return timeA - timeB;
      });
  }, [procedures, answeredIds, isAdmin]);

  const currentProc = dueProcedures[0];

  const handleAttendance = async (attended: boolean) => {
    if (!currentProc) return;

    setAnsweredIds((prev) => {
      const next = new Set(prev);
      next.add(currentProc.id);
      return next;
    });

    const newStatus = attended ? "in_progress" : "cancelled";

    try {
      await updateStatusMutation.mutateAsync({
        id: currentProc.id,
        data: { status: newStatus, notes: attended ? "Посетил прием" : "Не пришел на прием" },
      });
      qc.invalidateQueries();
    } catch (err) {
      setAnsweredIds((prev) => {
        const next = new Set(prev);
        next.delete(currentProc.id);
        return next;
      });
    }
  };

  if (!currentProc || !isAdmin) return null;

  const patientName = patientMap.get(currentProc.patientId) ?? "Пациент";
  const scheduledTimeStr = currentProc.scheduledAt
    ? new Date(currentProc.scheduledAt).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <AppDialog
      open
      onOpenChange={() => {}}
      title="Проверка присутствия"
      description={`Время приёма наступило (${scheduledTimeStr})`}
      size="sm"
      showClose={false}
      bodyClassName="!p-0"
      footer={
        <>
          <button
            type="button"
            onClick={() => handleAttendance(false)}
            disabled={updateStatusMutation.isPending}
            className="dash-btn dash-btn-secondary flex-1 !text-red-600 !border-red-200 hover:!bg-red-50"
          >
            Нет, не пришёл
          </button>
          <button
            type="button"
            onClick={() => handleAttendance(true)}
            disabled={updateStatusMutation.isPending}
            className="dash-btn dash-btn-primary flex-1"
          >
            Да, пришёл
          </button>
        </>
      }
    >
      <div className="bg-amber-500 px-5 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-[var(--ds-surface)]/20 rounded-xl flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4 text-white" />
        </div>
        <p className="text-white font-bold text-sm">Требуется подтверждение</p>
      </div>

      <div className="px-5 py-5 space-y-4">
        <p className="text-body font-semibold text-[var(--text)] text-center leading-relaxed">
          Пожалуйста, отметьте, пришёл ли пациент на приём?
        </p>

        <div className="rounded-xl p-3.5 space-y-2.5 border border-[var(--ds-border)] bg-[var(--bg)]">
          <div className="flex items-center gap-2.5">
            <User className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
            <span className="text-caption font-semibold text-[var(--text-secondary)] w-20">Пациент:</span>
            <span className="text-caption font-bold text-[var(--text)] truncate">{patientName}</span>
          </div>

          <div className="flex items-center gap-2.5">
            <Stethoscope className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
            <span className="text-caption font-semibold text-[var(--text-secondary)] w-20">Процедура:</span>
            <span className="text-caption font-bold text-[var(--text)] truncate">{currentProc.name}</span>
          </div>

          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
            <span className="text-caption font-semibold text-[var(--text-secondary)] w-20">Врач:</span>
            <span className="text-caption font-bold text-[var(--text)] truncate">
              {currentProc.doctorName ?? "—"}
            </span>
          </div>
        </div>
      </div>
    </AppDialog>
  );
}

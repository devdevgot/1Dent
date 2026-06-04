import { useState, useMemo } from "react";
import { Clock, User, Stethoscope, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useListProcedures,
  useListPatients,
  useUpdateProcedureStatus,
} from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 backdrop-blur-md p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-amber-500 px-5 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">Проверка присутствия</p>
            <p className="text-white/80 text-xs">Время приёма наступило ({scheduledTimeStr})</p>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          <p className="text-sm font-semibold text-gray-800 text-center leading-relaxed">
            Пожалуйста, отметьте, пришёл ли пациент на приём?
          </p>

          <div className="bg-slate-50 rounded-xl p-3.5 space-y-2.5 border border-slate-100">
            <div className="flex items-center gap-2.5">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-500 w-20">Пациент:</span>
              <span className="text-xs font-bold text-slate-800 truncate">{patientName}</span>
            </div>

            <div className="flex items-center gap-2.5">
              <Stethoscope className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-500 w-20">Процедура:</span>
              <span className="text-xs font-bold text-slate-800 truncate">{currentProc.name}</span>
            </div>

            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-xs font-semibold text-slate-500 w-20">Врач:</span>
              <span className="text-xs font-bold text-slate-800 truncate">
                {currentProc.doctorName ?? "—"}
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <Button
            onClick={() => handleAttendance(false)}
            variant="destructive"
            className="flex-1 rounded-xl font-bold py-5 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:text-red-700"
            disabled={updateStatusMutation.isPending}
          >
            Нет, не пришёл
          </Button>
          <Button
            onClick={() => handleAttendance(true)}
            className="flex-1 rounded-xl font-bold py-5"
            disabled={updateStatusMutation.isPending}
          >
            Да, пришёл
          </Button>
        </div>
      </div>
    </div>
  );
}

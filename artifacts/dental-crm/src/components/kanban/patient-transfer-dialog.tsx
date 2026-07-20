import { useMemo, useState } from "react";
import { Loader2, UserRound, ArrowRightLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetPatientQueryKey,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { AppDialog } from "@/components/layout/app-dialog";
import { TreatmentSchedulePicker } from "@/components/shared/treatment-schedule-picker";
import { useToast } from "@/hooks/use-toast";
import { getBaseUrl } from "@/lib/base-url";
import { cn } from "@/lib/utils";
import { filterTreatingDoctors, treatingDoctorLabel } from "@/lib/role-groups";

interface PatientTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  currentDoctorId: string | null;
  currentDoctorName?: string;
  allUsers: User[];
  canTransfer: boolean;
}

export function PatientTransferDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  currentDoctorId,
  currentDoctorName,
  allUsers,
  canTransfer,
}: PatientTransferDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingSchedule, setPendingSchedule] = useState<{ date: string; time: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const doctors = useMemo(
    () => filterTreatingDoctors(allUsers).filter((u) => u.id !== currentDoctorId),
    [allUsers, currentDoctorId],
  );

  const targetDoctor = doctors.find((d) => d.id === selectedDoctorId);

  const resetState = () => {
    setSelectedDoctorId("");
    setShowSchedulePicker(false);
    setShowConfirm(false);
    setPendingSchedule(null);
    setSubmitting(false);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const handleScheduleConfirm = (date: string, time: string) => {
    setPendingSchedule({ date, time });
    setShowSchedulePicker(false);
    setShowConfirm(true);
  };

  const handleTransfer = async () => {
    if (!selectedDoctorId || !pendingSchedule) return;

    const scheduledAt = new Date(`${pendingSchedule.date}T${pendingSchedule.time}:00`);
    if (Number.isNaN(scheduledAt.getTime())) {
      toast({ title: "Некорректная дата и время", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const tok = localStorage.getItem("auth_token");
      const res = await fetch(`${getBaseUrl()}/api/patients/${patientId}/transfer`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        body: JSON.stringify({
          toDoctorId: selectedDoctorId,
          scheduledAt: scheduledAt.toISOString(),
        }),
      });

      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "Не удалось передать пациента");
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetPatientQueryKey(patientId) }),
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() }),
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === "string" && key.toLowerCase().includes("procedure");
          },
        }),
      ]);

      toast({
        title: "Пациент передан",
        description: `${patientName} записан к врачу ${targetDoctor?.name ?? ""}`,
      });
      handleClose(false);
    } catch (err) {
      toast({
        title: "Ошибка передачи",
        description: err instanceof Error ? err.message : "Попробуйте ещё раз",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!canTransfer) return null;

  return (
    <>
      <AppDialog
        open={open && !showSchedulePicker && !showConfirm}
        onOpenChange={handleClose}
        title="Передать пациента"
        description="Выберите врача и время приёма у нового лечащего врача"
        size="md"
        footer={(
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => handleClose(false)}
              className="dash-btn dash-btn-secondary flex-1 py-2 text-sm font-semibold"
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={!selectedDoctorId}
              onClick={() => setShowSchedulePicker(true)}
              className={cn(
                "dash-btn flex-1 py-2 text-sm font-semibold flex items-center justify-center gap-1.5",
                selectedDoctorId ? "dash-btn-primary" : "opacity-50 cursor-not-allowed",
              )}
            >
              <ArrowRightLeft className="w-4 h-4" />
              Выбрать время
            </button>
          </div>
        )}
      >
        <div className="space-y-4">
          {currentDoctorName && (
            <div className="rounded-xl bg-[#faf8f4] border border-[#e8e3d9] px-3.5 py-3">
              <p className="text-xs text-[#64748b] mb-0.5">Текущий лечащий врач</p>
              <p className="text-sm font-semibold text-[#0f172a]">{currentDoctorName}</p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">
              Новый лечащий врач
            </p>
            <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
              {doctors.length === 0 ? (
                <p className="text-sm text-[#94a3b8] italic py-2">Нет доступных врачей</p>
              ) : (
                doctors.map((doctor) => (
                  <button
                    key={doctor.id}
                    type="button"
                    onClick={() => setSelectedDoctorId(doctor.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-all",
                      selectedDoctorId === doctor.id
                        ? "border-primary bg-primary/5"
                        : "border-[#e8e3d9] hover:bg-[#faf8f4]",
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                      selectedDoctorId === doctor.id
                        ? "bg-primary text-white"
                        : "bg-primary/10 text-primary",
                    )}>
                      {doctor.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0f172a] truncate">{treatingDoctorLabel(doctor)}</p>
                      <p className="text-xs text-[#94a3b8] truncate">{doctor.email}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </AppDialog>

      {showSchedulePicker && (
        <TreatmentSchedulePicker
          scheduledAt={null}
          title="Время приёма у нового врача"
          onClose={() => setShowSchedulePicker(false)}
          onConfirm={handleScheduleConfirm}
        />
      )}

      {showConfirm && targetDoctor && pendingSchedule && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-[360px] rounded-2xl p-5 shadow-xl border border-[#e8e3d9] flex flex-col text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary">
              <UserRound className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-[#0f172a] text-[16px]">Подтвердить передачу</h3>
              <p className="text-[13px] text-[#64748b] leading-relaxed">
                Передать пациента{" "}
                <span className="font-semibold text-[#0f172a]">{patientName}</span>{" "}
                врачу{" "}
                <span className="font-semibold text-[#0f172a]">{treatingDoctorLabel(targetDoctor)}</span>?
              </p>
              <p className="text-[13px] text-[#64748b]">
                Запись:{" "}
                <span className="font-semibold text-[#0f172a]">
                  {pendingSchedule.date.split("-").reverse().join(".")} в {pendingSchedule.time}
                </span>
              </p>
              <p className="text-[12px] text-[#94a3b8]">
                Пациент будет снят с текущего врача и появится в списке нового.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  setShowSchedulePicker(true);
                }}
                disabled={submitting}
                className="dash-btn dash-btn-secondary flex-1 py-2 text-sm font-semibold"
              >
                Назад
              </button>
              <button
                type="button"
                onClick={() => void handleTransfer()}
                disabled={submitting}
                className="dash-btn dash-btn-primary flex-1 py-2 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Передать
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

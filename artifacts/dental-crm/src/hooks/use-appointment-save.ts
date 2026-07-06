import {
  useCreateProcedure,
  useCreatePatient,
  useUpdateProcedure,
  useUpdateProcedureStatus,
  useDeleteProcedure,
  useUpdatePatientStatus,
  useListPatients,
  getListProceduresQueryKey,
  getListPatientsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { PaymentMethod } from "@workspace/api-client-react";
import type { ProcedureItem } from "@/components/appointment-modal";

export interface AppointmentSaveData {
  name: string;
  price: number;
  patientId: string;
  doctorId?: string;
  scheduledAt: string;
  notes?: string;
  status?: string;
  paymentMethod?: PaymentMethod;
  newPatient?: { name: string; phone: string; iin?: string; dateOfBirth?: string; gender?: string; source?: string };
}

export function useAppointmentSave({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { data: patientData } = useListPatients();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListProceduresQueryKey() });
    qc.invalidateQueries({ queryKey: getListPatientsQueryKey() });
  };

  const createPatientMutation = useCreatePatient({ mutation: { onSuccess: invalidate } });
  const createMutation        = useCreateProcedure({ mutation: { onSuccess: invalidate } });
  const updateMutation        = useUpdateProcedure({ mutation: { onSuccess: invalidate } });
  const updateStatusMutation  = useUpdateProcedureStatus({ mutation: { onSuccess: invalidate } });
  const deleteMutation        = useDeleteProcedure({ mutation: { onSuccess: invalidate } });
  const updatePatientStatusMutation = useUpdatePatientStatus({ mutation: { onSuccess: invalidate } });

  async function save(data: AppointmentSaveData, editingProcedure?: ProcedureItem | null) {
    if (editingProcedure) {
      await updateMutation.mutateAsync({
        id: editingProcedure.id,
        data: {
          name: data.name,
          price: data.price,
          doctorId: data.doctorId ?? null,
          scheduledAt: data.scheduledAt,
          notes: data.notes,
          paymentMethod: data.paymentMethod ?? null,
        },
      });
      if (data.status && data.status !== editingProcedure.status) {
        await updateStatusMutation.mutateAsync({
          id: editingProcedure.id,
          data: { status: data.status as "scheduled" | "in_progress" | "completed" | "cancelled" },
        });
      }
    } else {
      let resolvedPatientId = data.patientId;

      if (data.newPatient) {
        const createdPatient = await createPatientMutation.mutateAsync({
          data: {
            name: data.newPatient.name,
            phone: data.newPatient.phone,
            source: (data.newPatient.source as Parameters<typeof createPatientMutation.mutateAsync>[0]["data"]["source"]) || "other",
            ...(data.newPatient.iin ? { iin: data.newPatient.iin } : {}),
            ...(data.newPatient.dateOfBirth ? { dateOfBirth: data.newPatient.dateOfBirth } : {}),
            ...(data.newPatient.gender ? { gender: data.newPatient.gender as "male" | "female" | "other" } : {}),
          },
        });
        const newId = (createdPatient?.data as any)?.patient?.id ?? (createdPatient?.data as any)?.id;
        if (!newId) { onDone(); return; }
        resolvedPatientId = newId;
      }

      const created = await createMutation.mutateAsync({
        data: {
          name: data.name,
          patientId: resolvedPatientId,
          doctorId: data.doctorId,
          scheduledAt: data.scheduledAt,
          notes: data.notes,
          price: data.price,
        },
      });
      const createdId = (created?.data as any)?.procedure?.id ?? (created?.data as any)?.id;
      if (createdId && data.paymentMethod) {
        await updateMutation.mutateAsync({
          id: createdId,
          data: { paymentMethod: data.paymentMethod },
        });
      }
      const patientFull = (patientData?.data?.patients ?? []).find(
        (p) => p.id === resolvedPatientId,
      );
      if (!data.newPatient && patientFull?.status === "new_request") {
        await updatePatientStatusMutation.mutateAsync({
          id: resolvedPatientId,
          data: { status: "initial_consultation" },
        });
      }
    }
    onDone();
  }

  async function remove(procId: string) {
    await deleteMutation.mutateAsync({ id: procId });
    onDone();
  }

  async function removeMany(procIds: string[]) {
    for (const id of procIds) {
      await deleteMutation.mutateAsync({ id });
    }
    onDone();
  }

  const isSaving =
    createPatientMutation.isPending ||
    createMutation.isPending ||
    updateMutation.isPending ||
    updateStatusMutation.isPending ||
    deleteMutation.isPending;

  return { save, remove, removeMany, isSaving };
}

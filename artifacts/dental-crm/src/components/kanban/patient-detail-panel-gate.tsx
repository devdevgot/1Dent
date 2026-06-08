import { memo } from "react";
import { useKanbanStore } from "@/hooks/use-kanban";
import { PatientDetailPanel } from "./patient-detail-panel";

/** Mounts the heavy patient panel only when a card is open. */
export const PatientDetailPanelGate = memo(function PatientDetailPanelGate() {
  const selectedPatientId = useKanbanStore((s) => s.selectedPatientId);
  if (!selectedPatientId) return null;
  return <PatientDetailPanel />;
});

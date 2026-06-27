import { useParams, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { ToothDetailPanel } from "@/components/dental-chart/tooth-detail-panel";
import { useGetPatient, useListTeeth } from "@workspace/api-client-react";
import { useKanbanStore } from "@/hooks/use-kanban";

export default function ToothDetailPage() {
  const { patientId, fdi } = useParams<{ patientId: string; fdi: string }>();
  const [, setLocation] = useLocation();
  const setSelectedPatientId = useKanbanStore((s) => s.setSelectedPatientId);
  const setActiveTab = useKanbanStore((s) => s.setActiveTab);

  const { data: patientRes } = useGetPatient(patientId ?? "");
  const { data: teethRes } = useListTeeth(patientId ?? "");

  const patient = patientRes?.data?.patient;
  const teeth = teethRes?.data?.teeth ?? [];
  const fdiNum = parseInt(fdi ?? "0", 10);

  if (!patientId || !fdi) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-[#0f172a] font-manrope bg-[#faf8f4]">
        <p>Invalid patient or tooth</p>
      </div>
    );
  }

  const handleClose = () => {
    setSelectedPatientId(patientId!);
    setActiveTab("dental");
    setLocation("/patients");
  };

  return (
    <div className="h-full flex flex-col bg-[#faf8f4] font-manrope">
      {/* Header with back button */}
      <div className="shrink-0 border-b border-[#e8e3d9] bg-white shadow-sm px-4 py-3">
        <button
          onClick={handleClose}
          className="flex items-center gap-2 text-sm font-medium text-[#0f172a] hover:text-[#1f75fe] hover:bg-[#f1ede4] rounded-xl px-2 py-1.5 -ml-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад к пациентам
        </button>
      </div>

      {/* Full-page tooth detail content */}
      <div className="flex-1 overflow-hidden">
        {patient && (
          <ToothDetailPanel
            patientId={patientId}
            toothFdi={fdiNum}
            onClose={handleClose}
            patient={patient}
            teeth={teeth}
          />
        )}
      </div>
    </div>
  );
}

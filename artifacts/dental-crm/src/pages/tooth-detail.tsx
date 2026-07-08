import { useParams, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { ToothDetailPanel } from "@/components/dental-chart/tooth-detail-panel";
import {
  useGetPatient,
  useListTeeth,
  getGetPatientQueryKey,
  getListTeethQueryKey,
} from "@workspace/api-client-react";
import { useKanbanStore } from "@/hooks/use-kanban";
import { useTranslation } from "react-i18next";
import { ToothDetailContentSkeleton } from "@/components/skeletons";

function isValidFdi(fdi: number): boolean {
  if (!Number.isFinite(fdi)) return false;
  const quadrant = Math.floor(fdi / 10);
  const tooth = fdi % 10;
  return quadrant >= 1 && quadrant <= 8 && tooth >= 1 && tooth <= 8;
}

export default function ToothDetailPage() {
  const { t } = useTranslation();
  const { patientId, fdi } = useParams<{ patientId: string; fdi: string }>();
  const [, setLocation] = useLocation();
  const setSelectedPatientId = useKanbanStore((s) => s.setSelectedPatientId);
  const setActiveTab = useKanbanStore((s) => s.setActiveTab);

  const fdiNum = parseInt(fdi ?? "0", 10);
  const hasValidParams = !!patientId && !!fdi && isValidFdi(fdiNum);

  const {
    data: patientRes,
    isLoading: patientLoading,
    isError: patientError,
  } = useGetPatient(patientId ?? "", {
    query: {
      queryKey: getGetPatientQueryKey(patientId ?? ""),
      enabled: hasValidParams,
      retry: 1,
    },
  });

  const {
    data: teethRes,
    isLoading: teethLoading,
    isError: teethError,
  } = useListTeeth(patientId ?? "", {
    query: {
      queryKey: getListTeethQueryKey(patientId ?? ""),
      enabled: hasValidParams,
      retry: 1,
    },
  });

  const patient = patientRes?.data?.patient;
  const teeth = teethRes?.data?.teeth ?? [];
  const isLoading = patientLoading || teethLoading;
  const isError = patientError || teethError;

  if (!hasValidParams) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-[#0f172a] font-manrope bg-[#faf8f4]">
        <p>Invalid patient or tooth</p>
      </div>
    );
  }

  const handleClose = () => {
    setSelectedPatientId(patientId!);
    setActiveTab("treatment");
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
        {isLoading ? (
          <ToothDetailContentSkeleton />
        ) : isError || !patient ? (
          <div className="flex flex-col items-center justify-center h-full text-[#dc2626] text-sm gap-2">
            <p>{t("kanban.loadError")}</p>
            <button
              onClick={handleClose}
              className="text-[#1f75fe] hover:underline text-sm"
            >
              Назад к пациентам
            </button>
          </div>
        ) : (
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

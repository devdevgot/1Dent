import { useParams, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { ToothDetailPanel } from "@/components/dental-chart/tooth-detail-panel";
import { useGetPatient, useListTeeth } from "@workspace/api-client-react";

export default function ToothDetailPage() {
  const { patientId, fdi } = useParams<{ patientId: string; fdi: string }>();
  const [, setLocation] = useLocation();

  const { data: patientRes } = useGetPatient(patientId ?? "");
  const { data: teethRes } = useListTeeth(patientId ?? "");

  const patient = patientRes?.data?.patient;
  const teeth = teethRes?.data?.teeth ?? [];
  const fdiNum = parseInt(fdi ?? "0", 10);

  if (!patientId || !fdi) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-foreground">
        <p>Invalid patient or tooth</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header with back button */}
      <div className="shrink-0 border-b border-border/50 bg-white px-4 py-3">
        <button
          onClick={() => setLocation("/patients")}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
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
            onClose={() => setLocation("/patients")}
            patient={patient}
            teeth={teeth}
          />
        )}
      </div>
    </div>
  );
}

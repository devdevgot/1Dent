import type { Patient } from "@workspace/api-client-react";
import { PatientCardView } from "@/components/kanban/patient-card";
import { KANBAN_COLUMNS } from "@/lib/patient-utils";
import { PagePreviewFrame } from "./page-preview-frame";

const MOCK_PATIENTS: Patient[] = [
  {
    id: "lp-1",
    clinicId: "demo",
    name: "Асель Нурова",
    phone: "+7 701 234 56 78",
    source: "whatsapp",
    status: "new_request",
    createdAt: "2026-07-08T10:00:00Z",
    updatedAt: "2026-07-08T10:00:00Z",
  },
  {
    id: "lp-2",
    clinicId: "demo",
    name: "Данияр Касымов",
    phone: "+7 702 345 67 89",
    source: "instagram",
    status: "initial_consultation",
    createdAt: "2026-07-05T14:00:00Z",
    updatedAt: "2026-07-07T09:00:00Z",
  },
  {
    id: "lp-3",
    clinicId: "demo",
    name: "Мадина Сейтова",
    phone: "+7 703 456 78 90",
    source: "website",
    status: "diagnostics",
    createdAt: "2026-07-03T11:00:00Z",
    updatedAt: "2026-07-06T16:00:00Z",
  },
];

const VISIBLE_COLUMNS = KANBAN_COLUMNS.slice(0, 3);

export function KanbanPageMockup() {
  return (
    <PagePreviewFrame title="Пациенты — Канбан">
      <div className="landing-mockup-scroll p-3 bg-[#faf8f4] min-h-[200px]">
        <div className="flex gap-2 w-max sm:w-full min-w-full">
          {VISIBLE_COLUMNS.map((col) => {
            const patient = MOCK_PATIENTS.find((p) => p.status === col.id);
            if (!patient) return null;

            return (
              <div key={col.id} className="w-[132px] sm:flex-1 sm:min-w-0 sm:w-auto shrink-0 sm:shrink">
                <div className={`text-[9px] font-semibold px-2 py-1 rounded-lg mb-2 truncate ${col.headerColor}`}>
                  {col.label}
                </div>
                <PatientCardView
                  patient={patient}
                  progress={
                    patient.status === "initial_consultation"
                      ? { paid: 120000, debt: 80000, pending: 50000, paidCount: 2, debtCount: 1, pendingCount: 1 }
                      : undefined
                  }
                />
              </div>
            );
          })}
        </div>
      </div>
    </PagePreviewFrame>
  );
}

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
    status: "treatment_in_progress",
    createdAt: "2026-07-05T14:00:00Z",
    updatedAt: "2026-07-07T09:00:00Z",
  },
];

const VISIBLE_COLUMNS = KANBAN_COLUMNS.slice(0, 3);

export function KanbanPageMockup() {
  return (
    <PagePreviewFrame title="Пациенты — Канбан">
      <div className="flex gap-2 p-3 overflow-hidden bg-[#faf8f4] min-h-[220px]">
        {VISIBLE_COLUMNS.map((col, i) => (
          <div key={col.id} className="flex-1 min-w-0">
            <div className={`text-[9px] font-semibold px-2 py-1 rounded-lg mb-2 truncate ${col.headerColor}`}>
              {col.label}
            </div>
            <div className="scale-[0.92] origin-top-left w-[108%]">
              <PatientCardView
                patient={MOCK_PATIENTS[i]!}
                progress={
                  i === 1
                    ? { paid: 120000, debt: 80000, pending: 50000, paidCount: 2, debtCount: 1, pendingCount: 1 }
                    : undefined
                }
              />
            </div>
          </div>
        ))}
      </div>
    </PagePreviewFrame>
  );
}

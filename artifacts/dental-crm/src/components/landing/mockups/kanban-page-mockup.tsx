import type { Patient } from "@workspace/api-client-react";
import { KANBAN_COLUMNS } from "@/lib/patient-utils";
import { cn } from "@/lib/utils";
import { PagePreviewFrame } from "./page-preview-frame";
import { LandingKanbanCard } from "./landing-kanban-card";

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

function ColumnHeader({ label, headerColor }: { label: string; headerColor: string }) {
  return (
    <div className={cn("text-[10px] font-semibold px-2.5 py-1.5 rounded-lg truncate", headerColor)}>
      {label}
    </div>
  );
}

export function KanbanPageMockup() {
  return (
    <PagePreviewFrame title="Пациенты">
      <div className="p-4 bg-[#faf8f4] min-h-[240px]">
        <div className="space-y-3 sm:hidden">
          {VISIBLE_COLUMNS.map((col) => {
            const patient = MOCK_PATIENTS.find((p) => p.status === col.id);
            if (!patient) return null;

            return (
              <div key={col.id}>
                <ColumnHeader label={col.label} headerColor={col.headerColor} />
                <div className="mt-2">
                  <LandingKanbanCard patient={patient} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden sm:block landing-mockup-scroll">
          <div className="flex gap-3 w-full min-w-0">
            {VISIBLE_COLUMNS.map((col) => {
              const patient = MOCK_PATIENTS.find((p) => p.status === col.id);
              if (!patient) return null;

              return (
                <div key={col.id} className="flex-1 min-w-0">
                  <ColumnHeader label={col.label} headerColor={col.headerColor} />
                  <div className="mt-2">
                    <LandingKanbanCard patient={patient} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PagePreviewFrame>
  );
}

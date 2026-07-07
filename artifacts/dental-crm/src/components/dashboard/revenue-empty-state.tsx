import { Users, Stethoscope } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useKanbanStore } from "@/hooks/use-kanban";

const ILLUSTRATION_SRC = "/images/revenue-empty-illustration.png";

// Prefetch the illustration as soon as this chunk loads, so it is already
// in the browser cache by the time the empty state renders (no pop-in).
if (typeof window !== "undefined") {
  const img = new Image();
  img.src = ILLUSTRATION_SRC;
}

export function RevenueEmptyState() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const setIsCreateOpen = useKanbanStore((s) => s.setIsCreateOpen);

  const handleAddPatient = () => {
    setIsCreateOpen(true);
    navigate("/patients?view=kanban");
  };

  return (
    <div className="flex flex-col items-center px-6 pt-6 pb-7 text-center">
      <img
        src={ILLUSTRATION_SRC}
        alt=""
        aria-hidden
        draggable={false}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        width={200}
        height={200}
        className="w-full max-w-[200px] h-auto object-contain mb-4"
      />

      <h3 className="text-lg font-bold text-[var(--text)] tracking-tight">
        {t("ownerDashboard.revenueEmptyTitle")}
      </h3>
      <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-[300px] leading-relaxed">
        {t("ownerDashboard.revenueEmptyDesc")}
      </p>
      <p className="text-xs text-[var(--text-subtle)] mt-2.5 max-w-[280px] leading-relaxed">
        {t("ownerDashboard.revenueEmptyHint")}
      </p>

      <div className="flex flex-col w-full max-w-xs gap-2.5 mt-7">
        <button type="button" onClick={handleAddPatient} className="dash-btn dash-btn-primary w-full">
          <Users className="w-4 h-4" />
          {t("ownerDashboard.addFirstPatient")}
        </button>
        <button
          type="button"
          onClick={() => navigate("/procedures")}
          className="dash-btn dash-btn-secondary w-full"
        >
          <Stethoscope className="w-4 h-4" />
          {t("ownerDashboard.createFirstProcedure")}
        </button>
      </div>
    </div>
  );
}

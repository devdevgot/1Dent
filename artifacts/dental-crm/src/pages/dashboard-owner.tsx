import { Suspense, lazy, useState, useEffect } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import { useGetOwnerDashboardSummary } from "@workspace/api-client-react";
import { Layers, ChevronRight } from "lucide-react";
import { HomeServiceTiles, HomePromoBanners } from "@/components/dashboard/home-services";
import {
  MyProfitCard,
  type ProfitBranchTarget,
} from "@/components/dashboard/my-profit-card";
import { OwnerProfitSheet } from "@/components/dashboard/owner-profit-sheet";
import type { FilterPreset } from "@/components/dashboard/owner-dashboard-shared";
import { SITE } from "@/config/site";
import "@/styles/dashboard.css";

const OnboardingWizard = lazy(() =>
  import("@/components/dashboard/onboarding-wizard").then((m) => ({ default: m.OnboardingWizard })),
);

export default function OwnerDashboard() {
  const { clinic } = useAuthStore();
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    return localStorage.getItem("show_onboarding_wizard") === "true";
  });
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(() => {
    return localStorage.getItem("onboarding_completed") === "true";
  });
  const [profitSheetOpen, setProfitSheetOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<ProfitBranchTarget | null>(null);
  const [profitPeriod, setProfitPeriod] = useState<FilterPreset>("today");

  const { data: analyticsData, isLoading: analyticsLoading } = useGetOwnerDashboardSummary(
    undefined,
    { query: { staleTime: 60_000 } },
  );

  const rawAnalytics = (analyticsData?.data?.analytics ?? {}) as Record<string, unknown>;
  const totalPatients = Number(rawAnalytics.totalPatients ?? 0);
  const completedProcedures = Number(rawAnalytics.completedProceduresThisMonth ?? 0);

  const hasClinicData =
    !analyticsLoading &&
    Boolean(analyticsData) &&
    (totalPatients > 0 || completedProcedures > 0);

  useEffect(() => {
    if (analyticsData && !isOnboardingCompleted && hasClinicData) {
      localStorage.setItem("onboarding_completed", "true");
      localStorage.removeItem("show_onboarding_wizard");
      setIsOnboardingCompleted(true);
    }
  }, [analyticsData, isOnboardingCompleted, hasClinicData]);

  useEffect(() => {
    if (!isOnboardingCompleted && !hasClinicData && !onboardingOpen && clinic?.createdAt) {
      const ageMs = Date.now() - new Date(clinic.createdAt).getTime();
      if (ageMs < 7 * 24 * 60 * 60 * 1000) {
        setOnboardingOpen(true);
      }
    }
  }, [isOnboardingCompleted, hasClinicData, clinic?.createdAt, onboardingOpen]);

  useEffect(() => {
    document.title = SITE.dashboardTitles.owner;
  }, []);

  const handleSelectBranch = (target: ProfitBranchTarget) => {
    setSelectedBranch(target);
    setProfitSheetOpen(true);
  };

  return (
    <div className="dashboard-page min-h-full pb-8">
      <div className="pt-4">
        <HomeServiceTiles />
      </div>

      <div className="mt-3">
        <HomePromoBanners />
      </div>

      <MyProfitCard
        listPreset={profitPeriod}
        onListPresetChange={setProfitPeriod}
        onSelectBranch={handleSelectBranch}
      />

      {!isOnboardingCompleted && (
        <div className="mx-4 mt-4 dash-card dash-card-padded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 bg-[#fef3c7] text-[#d97706] rounded-full px-3 py-1 text-xs font-medium mb-2">
              <Layers className="w-3 h-3" />
              Быстрый старт
            </span>
            <h4 className="text-base font-bold text-[#0f172a]">Мастер настроек 1Dent</h4>
            <p className="text-sm text-[#64748b] mt-1 leading-relaxed">
              Настройте сотрудников, ИИ-чатбота, геолокацию и Telegram для полноценного старта.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            className="dash-btn dash-btn-primary w-full sm:w-auto shrink-0"
          >
            Продолжить настройку
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {selectedBranch && (
        <OwnerProfitSheet
          open={profitSheetOpen}
          onOpenChange={setProfitSheetOpen}
          branchId={selectedBranch.id}
          branchName={selectedBranch.name}
          filterPreset={profitPeriod}
        />
      )}

      {onboardingOpen && (
        <Suspense fallback={null}>
          <OnboardingWizard
            open={onboardingOpen}
            onClose={() => {
              setOnboardingOpen(false);
              setIsOnboardingCompleted(localStorage.getItem("onboarding_completed") === "true");
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

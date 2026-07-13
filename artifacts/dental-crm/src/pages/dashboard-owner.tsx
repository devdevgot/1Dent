import { useState, useEffect } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import { HomeServiceTiles, HomePromoBanners } from "@/components/dashboard/home-services";
import {
  MyProfitCard,
  type ProfitBranchTarget,
} from "@/components/dashboard/my-profit-card";
import { OwnerProfitSheet } from "@/components/dashboard/owner-profit-sheet";
import type { FilterPreset } from "@/components/dashboard/owner-dashboard-shared";
import { SITE } from "@/config/site";
import "@/styles/dashboard.css";

export default function OwnerDashboard() {
  const { clinic } = useAuthStore();
  const [profitSheetOpen, setProfitSheetOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<ProfitBranchTarget | null>(null);
  const [profitPeriod, setProfitPeriod] = useState<FilterPreset>("today");

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

      {selectedBranch && (
        <OwnerProfitSheet
          open={profitSheetOpen}
          onOpenChange={setProfitSheetOpen}
          branchId={selectedBranch.id}
          branchName={selectedBranch.name}
          filterPreset={profitPeriod}
        />
      )}
    </div>
  );
}

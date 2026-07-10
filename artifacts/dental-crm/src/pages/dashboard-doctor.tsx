import { useEffect, useState } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import { HomeServiceTiles, HomePromoBanners } from "@/components/dashboard/home-services";
import { MySalaryCard } from "@/components/dashboard/my-salary-card";
import type { FilterPreset } from "@/components/dashboard/owner-dashboard-shared";
import { SITE } from "@/config/site";
import "@/styles/dashboard.css";

function getClinicalDashboardTitle(role: string | undefined): string {
  switch (role) {
    case "doctor":
      return SITE.dashboardTitles.doctor;
    case "assistant":
      return SITE.dashboardTitles.assistant;
    case "nurse":
      return SITE.dashboardTitles.nurse;
    default:
      return SITE.dashboardTitles.doctor;
  }
}

export default function DoctorDashboard() {
  const { user } = useAuthStore();
  const [salaryPeriod, setSalaryPeriod] = useState<FilterPreset>("today");

  useEffect(() => {
    document.title = getClinicalDashboardTitle(user?.role);
  }, [user?.role]);

  return (
    <div className="dashboard-page min-h-full pb-8">
      <div className="pt-4">
        <HomeServiceTiles />
      </div>

      <div className="mt-3">
        <HomePromoBanners />
      </div>

      <MySalaryCard
        listPreset={salaryPeriod}
        onListPresetChange={setSalaryPeriod}
      />
    </div>
  );
}

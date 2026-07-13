import { useState, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useGetDoctorDetailedAnalyticsMe,
  type GetDoctorDetailedAnalyticsMeParams,
} from "@workspace/api-client-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import {
  DoctorAnalyticsView,
  DoctorAnalyticsFiltersBadge,
  computeDateRange,
  type AnalyticsPreset,
} from "@/components/staff/doctor-analytics-view";
import { usePageBack } from "@/hooks/use-page-back";

export default function DoctorAnalyticsPage() {
  const goBack = usePageBack();
  const { t } = useTranslation();

  const [preset, setPreset] = useState<AnalyticsPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [minRevenueInput, setMinRevenueInput] = useState("");

  const params = useMemo<GetDoctorDetailedAnalyticsMeParams>(() => {
    const { dateFrom, dateTo } = computeDateRange(preset, customFrom, customTo);
    const p: GetDoctorDetailedAnalyticsMeParams = {};
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo) p.dateTo = dateTo;
    if (selectedType) p.procedureType = selectedType;
    const minRev = Number(minRevenueInput);
    if (!isNaN(minRev) && minRev > 0) p.minRevenue = minRev;
    return p;
  }, [preset, customFrom, customTo, selectedType, minRevenueInput]);

  const { data, isLoading, isFetching, isError, refetch } = useGetDoctorDetailedAnalyticsMe(
    Object.keys(params).length > 0 ? params : undefined,
  );

  return (
    <PageShell className="h-full flex flex-col overflow-hidden" animate={false}>
      <PageHeader
        title={t("doctorAnalytics.title")}
        subtitle={t("doctorAnalytics.subtitle")}
        onBack={goBack}
        icon={<BarChart3 className="w-5 h-5" strokeWidth={1.8} />}
        badge={
          <DoctorAnalyticsFiltersBadge
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            selectedType={selectedType}
            minRevenueInput={minRevenueInput}
          />
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <DoctorAnalyticsView
          analytics={data?.data?.analytics}
          isLoading={isLoading}
          isFetching={isFetching}
          isError={isError}
          refetch={() => { void refetch(); }}
          preset={preset}
          setPreset={setPreset}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
          selectedType={selectedType}
          setSelectedType={setSelectedType}
          minRevenueInput={minRevenueInput}
          setMinRevenueInput={setMinRevenueInput}
        />
      </div>
    </PageShell>
  );
}

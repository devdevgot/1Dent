import { useState, useMemo } from "react";
import { useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useGetDoctorDetailedAnalytics,
  useListUsersAll,
  findCachedStaffUser,
  STAFF_LIST_STALE_MS,
  type GetDoctorDetailedAnalyticsParams,
} from "@workspace/api-client-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StaffCabinetNav } from "@/components/staff/staff-cabinet-nav";
import {
  DoctorAnalyticsView,
  DoctorAnalyticsFiltersBadge,
  computeDateRange,
  type AnalyticsPreset,
} from "@/components/staff/doctor-analytics-view";
import { usePageBack } from "@/hooks/use-page-back";

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  doctor: "Врач",
  accountant: "Бухгалтер",
  warehouse: "Склад",
  assistant: "Ассистент",
  nurse: "Медсестра",
};

function getInitials(name: string | null | undefined) {
  if (!name) return "";
  return name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export default function StaffAnalyticsPage({
  overlayDoctorId,
}: {
  overlayDoctorId?: string;
} = {}) {
  const { t } = useTranslation();
  const { doctorId: routeDoctorId } = useParams<{ doctorId: string }>();
  const doctorId = overlayDoctorId ?? routeDoctorId;
  const goBack = usePageBack({ menuFallback: true });
  const queryClient = useQueryClient();

  const [preset, setPreset] = useState<AnalyticsPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [minRevenueInput, setMinRevenueInput] = useState("");

  const cachedUser = useMemo(
    () => (doctorId ? findCachedStaffUser(queryClient, doctorId) : undefined),
    [queryClient, doctorId],
  );

  const { data: usersData, isLoading: usersLoading } = useListUsersAll(
    { includeInactive: true },
    {
      query: {
        enabled: !cachedUser,
        staleTime: STAFF_LIST_STALE_MS,
        placeholderData: () =>
          queryClient.getQueryData(["/api/users", { includeInactive: true }]) ??
          queryClient.getQueryData(["/api/users", { includeInactive: false }]),
      },
    },
  );

  const selectedUser =
    cachedUser ?? usersData?.data?.users?.find((u) => u && u.id === doctorId);
  const isDoctor = selectedUser?.role === "doctor";

  const params = useMemo<GetDoctorDetailedAnalyticsParams>(() => {
    const { dateFrom, dateTo } = computeDateRange(preset, customFrom, customTo);
    const p: GetDoctorDetailedAnalyticsParams = {};
    if (dateFrom) p.dateFrom = dateFrom as unknown as Date;
    if (dateTo) p.dateTo = dateTo as unknown as Date;
    if (selectedType) p.procedureType = selectedType;
    const minRev = Number(minRevenueInput);
    if (!isNaN(minRev) && minRev > 0) p.minRevenue = minRev;
    return p;
  }, [preset, customFrom, customTo, selectedType, minRevenueInput]);

  const { data, isLoading, isFetching, isError, refetch } = useGetDoctorDetailedAnalytics(
    doctorId ?? "",
    Object.keys(params).length > 0 ? params : undefined,
    {
      query: {
        enabled: !!doctorId && isDoctor,
        staleTime: 60_000,
      },
    },
  );

  if (!selectedUser && usersLoading) {
    return (
      <PageShell className="h-full flex flex-col overflow-hidden" animate={false}>
        <div className="px-5 pt-4">
          <Skeleton className="h-10 w-48 rounded-xl" />
          <Skeleton className="h-4 w-32 rounded-lg mt-2" />
        </div>
        <div className="p-6">
          <Skeleton className="h-8 w-64 rounded-xl mb-6" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </PageShell>
    );
  }

  if (!selectedUser || !doctorId) {
    return (
      <PageShell className="h-full flex items-center justify-center">
        <p className="text-[#64748b]">{t("staff.notFound")}</p>
      </PageShell>
    );
  }

  return (
    <PageShell className="h-full flex flex-col overflow-hidden" animate={false}>
      <PageHeader
        title={selectedUser.name ?? ""}
        subtitle={[
          ROLE_LABELS[selectedUser.role] ?? selectedUser.role,
          t("employees.analytics", "Аналитика"),
        ].filter(Boolean).join(" • ")}
        onBack={goBack}
        icon={
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--ds-primary)] to-[var(--ds-primary)] flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
            {getInitials(selectedUser.name)}
          </div>
        }
        badge={
          <DoctorAnalyticsFiltersBadge
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            selectedType={selectedType}
            minRevenueInput={minRevenueInput}
          />
        }
        bottom={
          doctorId ? <StaffCabinetNav doctorId={doctorId} active="analytics" /> : undefined
        }
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {!isDoctor ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[40vh] gap-4 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--primary-light)] flex items-center justify-center">
              <BarChart2 className="w-8 h-8 text-[#1f75fe]/50" />
            </div>
            <div>
              <p className="text-base font-bold text-[#64748b]">
                {t("staff.analyticsDoctorOnly", "Аналитика доступна для врачей")}
              </p>
              <p className="text-xs text-[#94a3b8] mt-1.5 max-w-xs mx-auto">
                {t("staff.analyticsDoctorOnlyHint", "Для этой роли доступен только раздел ФОТ")}
              </p>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </PageShell>
  );
}

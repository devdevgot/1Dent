import { useMemo } from "react";
import { useLocation } from "wouter";
import type { DoctorKpi } from "@workspace/api-client-react";
import { useGetDoctorKpis, getGetDoctorKpisQueryKey } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Trophy, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader, PageHeaderIconButton } from "@/components/layout/page-header";
import { StaffSectionNav } from "@/components/staff/staff-section-nav";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { usePageBack } from "@/hooks/use-page-back";
import { useOverlayNavigation } from "@/hooks/use-overlay-navigation";

function getInitials(name: string | null | undefined) {
  if (!name) return "";
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function scoreTone(score: number) {
  if (score >= 80) return "bg-[#f0fdf4] text-[#16a34a] border-[#16a34a]/20";
  if (score >= 60) return "bg-[#fef3c7] text-[#d97706] border-[#d97706]/20";
  return "bg-[#fef2f2] text-[#dc2626] border-[#dc2626]/20";
}

function npsTone(nps: number) {
  if (nps >= 70) return "bg-[#f0fdf4] text-[#16a34a]";
  if (nps >= 50) return "bg-[#fef3c7] text-[#d97706]";
  return "bg-[#fef2f2] text-[#dc2626]";
}

function DoctorRatingCard({
  doctor,
  rank,
  onClick,
  t,
}: {
  doctor: DoctorKpi;
  rank: number;
  onClick: () => void;
  t: (key: string, fallback?: string) => string;
}) {
  const score = Number(doctor.score ?? 0);
  const nps = Number(doctor.nps ?? 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white rounded-2xl border border-[#e8e3d9] p-5 text-left shadow-md hover:shadow-lg hover:border-[#1f75fe]/30 transition-all w-full"
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1f75fe] to-[#1a65e8] flex items-center justify-center text-white font-bold text-sm">
            {getInitials(doctor.doctorName)}
          </div>
          <span className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-[#0f172a] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
            {rank}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold text-[#0f172a] truncate">{doctor.doctorName}</h3>
            <span
              className={cn(
                "shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border",
                scoreTone(score),
              )}
            >
              <Trophy className="w-3 h-3" />
              {score}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#64748b]">{t("staff.patients")}</span>
              <span className="text-sm font-semibold text-[#0f172a]">{doctor.patientsCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#64748b]">{t("staff.procedures")}</span>
              <span className="text-sm font-semibold text-[#0f172a]">{doctor.proceduresCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#64748b]">{t("staff.revenue")}</span>
              <span className="text-sm font-semibold text-[#0f172a]">
                ₸{Number(doctor.revenueTotal).toLocaleString("ru-KZ")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#64748b]">{t("staff.avgCheck")}</span>
              <span className="text-sm font-semibold text-[#0f172a]">
                ₸{Math.round(Number(doctor.averageCheck ?? 0)).toLocaleString("ru-KZ")}
              </span>
            </div>
            {nps > 0 && (
              <div className="col-span-2 flex items-center justify-between pt-2 border-t border-[#e8e3d9]">
                <span className="text-xs text-[#64748b]">{t("staff.nps")}</span>
                <span className={cn("text-sm font-semibold px-2 py-0.5 rounded-full", npsTone(nps))}>
                  {nps}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function DoctorRatingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const goBack = usePageBack({ menuFallback: true });
  const { isOverlay, pushDetail } = useOverlayNavigation();
  const { data: kpiData, isLoading } = useGetDoctorKpis({
    query: { staleTime: 60_000 },
  });

  const openStaffDetail = (id: string) => {
    if (isOverlay) pushDetail(id);
    else navigate(`/users/${id}`);
  };

  const doctors = useMemo(() => {
    const kpis = kpiData?.data?.kpis ?? [];
    return [...kpis].sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
  }, [kpiData]);

  return (
    <PageShell animate={false}>
      <PageHeader
        title={t("staff.ratingsTitle", "Рейтинг врачей")}
        subtitle={
          doctors.length > 0
            ? t("staff.ratingsSubtitle", "Рейтинг на основе выручки, процедур и отзывов пациентов")
            : undefined
        }
        onBack={goBack}
        right={
          <PageHeaderIconButton
            onClick={() => queryClient.invalidateQueries({ queryKey: getGetDoctorKpisQueryKey() })}
            title={t("common.refresh", "Обновить")}
          >
            <RefreshCw className="w-4 h-4" />
          </PageHeaderIconButton>
        }
        bottom={<StaffSectionNav active="ratings" />}
      />

      <div className="px-5 pt-4 pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-[var(--ds-primary)]/20 border-t-[var(--ds-primary)] rounded-full animate-spin" />
          </div>
        ) : doctors.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#1f75fe]/10 to-[#1f75fe]/5 flex items-center justify-center mx-auto mb-5">
              <Trophy className="w-10 h-10 text-[#1f75fe]/40" />
            </div>
            <p className="text-base font-bold text-[#64748b]">
              {t("staff.noRatings", "Нет данных для рейтинга")}
            </p>
            <p className="text-xs text-[#94a3b8] mt-1.5 max-w-xs mx-auto">
              {t("staff.noRatingsHint", "Рейтинг появится после первых приёмов и процедур")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {doctors.map((doctor, idx) => (
              <DoctorRatingCard
                key={doctor.doctorId}
                doctor={doctor}
                rank={idx + 1}
                onClick={() => openStaffDetail(doctor.doctorId)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

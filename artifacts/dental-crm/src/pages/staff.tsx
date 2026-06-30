import { useLocation } from "wouter";
import { useGetDoctorKpis } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";

export default function StaffPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data: kpiData, isLoading } = useGetDoctorKpis();
  
  const doctors = kpiData?.data?.kpis ?? [];

  const getInitials = (name: string | null | undefined) => {
    if (!name) return "";
    return name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  };

  if (isLoading) {
    return (
      <PageShell className="h-full flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[var(--primary)]/20 border-t-[var(--primary)] rounded-full animate-spin" />
      </PageShell>
    );
  }

  return (
    <PageShell className="h-full flex flex-col overflow-hidden" animate={false}>
      <PageHeader
        title={t("staff.title")}
        subtitle={t("staff.subtitle")}
        onBack={() => window.history.back()}
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {doctors.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#64748b]">
            <p>{t("staff.noStaff")}</p>
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {doctors.map((doctor) => (
              <button
                key={doctor.doctorId}
                onClick={() => setLocation(`/staff/${doctor.doctorId}`)}
                className="bg-white rounded-2xl border border-[#e8e3d9] p-6 text-left shadow-md hover:shadow-lg hover:border-[#1f75fe]/30 transition-all"
              >
                {/* Avatar */}
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1f75fe] to-[#1a65e8] flex items-center justify-center text-white font-bold text-lg mb-4 shrink-0">
                  {getInitials(doctor.doctorName)}
                </div>

                {/* Name */}
                <h3 className="text-lg font-bold text-[#0f172a] mb-3">{doctor.doctorName}</h3>

                {/* Stats Grid */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#64748b]">{t("staff.patients")}</span>
                    <span className="text-sm font-semibold text-[#0f172a]">{doctor.patientsCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#64748b]">{t("staff.procedures")}</span>
                    <span className="text-sm font-semibold text-[#0f172a]">{doctor.proceduresCount}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[#e8e3d9]">
                    <span className="text-xs text-[#64748b]">{t("staff.revenue")}</span>
                    <span className="text-sm font-semibold text-[#0f172a]">₸{doctor.revenueTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#64748b]">{t("staff.avgCheck")}</span>
                    <span className="text-sm font-semibold text-[#0f172a]">₸{Math.round(doctor.averageCheck).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#64748b]">NPS</span>
                    <span className={`text-sm font-semibold px-2 py-1 rounded-full ${
                      doctor.nps >= 70 ? "bg-[#f0fdf4] text-[#16a34a]" :
                      doctor.nps >= 50 ? "bg-[#fef3c7] text-[#d97706]" :
                      "bg-[#fef2f2] text-[#dc2626]"
                    }`}>
                      {doctor.nps}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

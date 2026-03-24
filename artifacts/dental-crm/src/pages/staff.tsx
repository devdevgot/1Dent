import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useGetDoctorKpis } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";

export default function StaffPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data: kpiData, isLoading } = useGetDoctorKpis();
  
  const doctors = kpiData?.data?.kpis ?? [];

  const getInitials = (name: string) => {
    return name.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 bg-white px-6 py-4">
        <button
          onClick={() => setLocation("/dashboard")}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("common.back")}
        </button>
        <h1 className="text-2xl font-bold text-foreground">{t("staff.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("staff.subtitle")}</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {doctors.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>{t("staff.noStaff")}</p>
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {doctors.map((doctor) => (
              <button
                key={doctor.doctorId}
                onClick={() => setLocation(`/staff/${doctor.doctorId}`)}
                className="bg-white rounded-2xl border border-border/50 p-6 text-left hover:shadow-lg hover:border-primary/30 transition-all"
              >
                {/* Avatar */}
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg mb-4 shrink-0">
                  {getInitials(doctor.doctorName)}
                </div>

                {/* Name */}
                <h3 className="text-lg font-bold text-foreground mb-3">{doctor.doctorName}</h3>

                {/* Stats Grid */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t("staff.patients")}</span>
                    <span className="text-sm font-semibold text-foreground">{doctor.patientsCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t("staff.procedures")}</span>
                    <span className="text-sm font-semibold text-foreground">{doctor.proceduresCount}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/30">
                    <span className="text-xs text-muted-foreground">{t("staff.revenue")}</span>
                    <span className="text-sm font-semibold text-foreground">₸{doctor.revenueTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t("staff.avgCheck")}</span>
                    <span className="text-sm font-semibold text-foreground">₸{Math.round(doctor.averageCheck).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">NPS</span>
                    <span className={`text-sm font-semibold px-2 py-1 rounded-full ${
                      doctor.nps >= 70 ? "bg-emerald-100 text-emerald-700" :
                      doctor.nps >= 50 ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
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
    </div>
  );
}

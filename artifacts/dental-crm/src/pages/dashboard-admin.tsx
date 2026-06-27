import { useState, useMemo } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useListProcedures,
  useListPatients,
  useListUsers,
  useListProcedureTemplates,
  useGetDoctorKpis,
  getGetDoctorKpisQueryKey,
  useUpdateProcedurePayment,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users, Calendar,
  KanbanSquare, Stethoscope, ChevronRight,
  Clock, Wallet, PlusCircle, CheckCircle2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { format, parseISO, startOfDay, endOfDay, isYesterday } from "date-fns";
import { AppointmentModal, type ProcedureItem } from "@/components/appointment-modal";
import { useAppointmentSave } from "@/hooks/use-appointment-save";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  kaspi_transfer: "Kaspi Transfer",
  cash:           "Наличные",
  kaspi_qr:       "Kaspi QR",
  terminal:       "Терминал",
  kaspi_red:      "Kaspi Red",
  debt:           "Долг",
};

const BRAND_BLUE = "#1f75fe";

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const [, navigate] = useLocation();
  const [selectingPayment, setSelectingPayment] = useState<string | null>(null);
  const [showApptModal, setShowApptModal] = useState(false);
  const qc = useQueryClient();

  const { data: proceduresData } = useListProcedures();
  const { data: patientsData } = useListPatients();
  const { data: usersData } = useListUsers();
  const { data: templateData } = useListProcedureTemplates();
  const { data: kpiData } = useGetDoctorKpis({
    query: { queryKey: getGetDoctorKpisQueryKey() },
  });

  const updatePayment = useUpdateProcedurePayment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/procedures"] });
        setSelectingPayment(null);
      },
    },
  });

  const procedures = proceduresData?.data?.procedures ?? [];
  const rawPatients = patientsData?.data?.patients ?? [];
  const patients = rawPatients;
  const doctorKpis = kpiData?.data?.kpis ?? [];

  /* Data for the appointment modal */
  const modalPatients = useMemo(
    () => rawPatients.map((p) => ({
      id: p.id,
      name: p.name,
      phone: (p as any).phone ?? "",
      iin: (p as any).iin ?? null,
      doctorId: null as string | null,
    })),
    [rawPatients],
  );
  const modalDoctors = useMemo(
    () =>
      (usersData?.data?.users ?? [])
        .filter((u) => u.role === "doctor")
        .map((u) => ({ id: u.id, name: u.name })),
    [usersData],
  );
  const modalTemplates = useMemo(
    () => (templateData?.data?.templates ?? []) as any[],
    [templateData],
  );

  const apptSave = useAppointmentSave({ onDone: () => setShowApptModal(false) });

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const todayProcedures = procedures.filter((p) => {
    if (p.scheduledAt) {
      const d = parseISO(p.scheduledAt);
      return d >= todayStart && d <= todayEnd && p.status === "scheduled";
    }
    return false;
  }).sort((a, b) => {
    const da = a.scheduledAt ? parseISO(a.scheduledAt).getTime() : 0;
    const db = b.scheduledAt ? parseISO(b.scheduledAt).getTime() : 0;
    return da - db;
  });

  const getRefDate = (p: typeof procedures[0]) =>
    p.scheduledAt ? parseISO(p.scheduledAt) : parseISO(p.createdAt);

  const fmtOverdueDate = (p: typeof procedures[0]) => {
    const d = getRefDate(p);
    if (isYesterday(d)) return "вчера";
    return format(d, "d MMM");
  };

  const todayActiveTasks = procedures.filter((p) => {
    if (p.status !== "in_progress") return false;
    const d = getRefDate(p);
    return d >= todayStart && d <= todayEnd;
  });

  const overdueActiveTasks = procedures
    .filter((p) => p.status === "in_progress" && getRefDate(p) < todayStart)
    .sort((a, b) => getRefDate(b).getTime() - getRefDate(a).getTime());

  const activeTasks = [...todayActiveTasks, ...overdueActiveTasks];

  const todayPendingPayment = procedures
    .filter((p) => {
      if ((p.status as string) !== "pending_payment") return false;
      const d = getRefDate(p);
      return d >= todayStart && d <= todayEnd;
    })
    .sort((a, b) => getRefDate(a).getTime() - getRefDate(b).getTime());

  const overduePendingPayment = procedures
    .filter((p) => (p.status as string) === "pending_payment" && getRefDate(p) < todayStart)
    .sort((a, b) => getRefDate(b).getTime() - getRefDate(a).getTime());

  const pendingPaymentQueue = [...todayPendingPayment, ...overduePendingPayment];

  const formatMoney = (v: number) => v.toLocaleString("ru-RU") + " ₸";

  const topDoctors = [...doctorKpis]
    .sort((a, b) => b.revenueTotal - a.revenueTotal)
    .slice(0, 5);

  const maxRevenue = topDoctors[0]?.revenueTotal ?? 1;


  return (
    <div className="space-y-6 p-6 pb-12 max-w-7xl mx-auto bg-[#faf8f4] font-manrope min-h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-[#e8e3d9] shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-[#0f172a]">
            {t("dashboard.welcomeBack", { name: (user?.name || "").split(" ")[0] })}
          </h2>
          <p className="text-[#64748b] mt-1">
            {t("adminDashboard.subtitle", { clinic: clinic?.name })}
          </p>
        </div>
        <button
          onClick={() => setShowApptModal(true)}
          className="px-5 py-2.5 bg-[#1f75fe] hover:bg-[#1a65e8] text-white font-semibold rounded-full transition-all hover:scale-105 active:scale-95"
        >
          {t("adminNav.newAppointment")}
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Schedule */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-[#0f172a] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#1f75fe]" />
              {t("adminDashboard.todaySchedule")}
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#1f75fe]/10 text-[#1f75fe] ml-1">
                {todayProcedures.length}
              </span>
            </h3>
            <button
              onClick={() => navigate("/admin/calendar")}
              className="text-sm text-[#1f75fe] font-semibold flex items-center gap-1 hover:underline"
            >
              {t("dashboard.viewAll")} <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {todayProcedures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Calendar className="w-10 h-10 text-[#94a3b8] mb-3" />
              <p className="text-[#64748b] font-medium">{t("adminDashboard.noSchedule")}</p>
            </div>
          ) : (
            <div className="divide-y divide-[#e8e3d9]">
              {todayProcedures.slice(0, 8).map((proc, i) => {
                const patient = patients.find((p) => p.id === proc.patientId);
                const timeStr = proc.scheduledAt
                  ? format(parseISO(proc.scheduledAt), "HH:mm")
                  : "—";
                return (
                  <motion.div
                    key={proc.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-4 py-3"
                  >
                    <div className="w-12 text-center flex-none">
                      <span className="text-sm font-bold text-[#1f75fe]">{timeStr}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#0f172a] truncate">{proc.name}</p>
                      <p className="text-xs text-[#64748b]">
                        {patient?.name ?? "—"}
                        {proc.doctorName && ` · ${proc.doctorName}`}
                      </p>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#e0f2fe] text-[#0284c7] flex-none">
                      {t("adminDashboard.scheduled")}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column: Active Tasks + Top Doctors */}
        <div className="space-y-4">
          {/* Ожидают оплаты */}
          <div className="bg-white rounded-2xl border border-[#e8e3d9] p-5 shadow-md">
            <h3 className="text-base font-bold text-[#0f172a] flex items-center gap-2 mb-4">
              <Wallet className="w-4 h-4 text-[#16a34a]" />
              Оплата
              {pendingPaymentQueue.length > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#f0fdf4] text-[#16a34a] ml-1">
                  {pendingPaymentQueue.length}
                </span>
              )}
            </h3>
            {pendingPaymentQueue.length === 0 ? (
              <p className="text-sm text-[#94a3b8] py-2">Нет ожидающих оплат</p>
            ) : (
              <div className="space-y-4">
                {todayPendingPayment.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-[#16a34a] uppercase tracking-wide mb-1.5">Сегодня</p>
                    <div className="space-y-2">
                      {todayPendingPayment.map((proc) => {
                        const patient = patients.find((p) => p.id === proc.patientId);
                        const isSelecting = selectingPayment === proc.id;
                        const isSaving = updatePayment.isPending;
                        return (
                          <div key={proc.id} className="flex flex-col gap-2 p-3 rounded-xl bg-[#f0fdf4]/50 border border-[#f0fdf4]">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-[#0f172a] truncate">{proc.name}</p>
                                <p className="text-[10px] text-[#64748b] truncate">
                                  {patient?.name ?? "—"}{proc.doctorName && ` · ${proc.doctorName}`}
                                </p>
                                <p className="text-[10px] font-bold text-[#16a34a] mt-0.5">
                                  {proc.price ? formatMoney(proc.price) : "—"}
                                </p>
                              </div>
                              {!isSelecting && (
                                <button
                                  onClick={() => setSelectingPayment(proc.id)}
                                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-[#f0fdf4] text-[#16a34a] hover:bg-[#f0fdf4]/80 transition-colors"
                                >
                                  <CheckCircle2 className="w-3 h-3 text-[#16a34a]" />
                                  Оплата
                                </button>
                              )}
                            </div>
                            {isSelecting && (
                              <div className="flex flex-wrap gap-1 mt-1 pl-1">
                                {(["cash", "kaspi_qr", "kaspi_transfer", "terminal", "kaspi_red", "debt"] as const).map((method) => (
                                  <button
                                    key={method}
                                    disabled={isSaving}
                                    onClick={() => updatePayment.mutate({ id: proc.id, data: { paymentMethod: method } })}
                                    className="px-1.5 py-0.5 text-[9px] font-medium rounded-md border border-[#e8e3d9] bg-white hover:border-[#1f75fe] hover:bg-[#1f75fe]/10 hover:text-[#1f75fe] transition-colors disabled:opacity-50"
                                  >
                                    {PAYMENT_METHOD_LABELS[method]}
                                  </button>
                                ))}
                                <button
                                  onClick={() => setSelectingPayment(null)}
                                  className="px-1.5 py-0.5 text-[9px] font-medium rounded-md border border-[#e8e3d9] text-[#94a3b8] bg-white hover:bg-[#f1ede4] transition-colors"
                                >
                                  Отмена
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {overduePendingPayment.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-[#dc2626] uppercase tracking-wide mb-1.5">Незакрытые</p>
                    <div className="space-y-2">
                      {overduePendingPayment.map((proc) => {
                        const patient = patients.find((p) => p.id === proc.patientId);
                        const isSelecting = selectingPayment === proc.id;
                        const isSaving = updatePayment.isPending;
                        return (
                          <div key={proc.id} className="flex flex-col gap-2 p-3 rounded-xl bg-[#fef2f2]/50 border border-[#fef2f2]">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-[#0f172a] truncate">{proc.name}</p>
                                <p className="text-[10px] text-[#64748b] truncate">
                                  {patient?.name ?? "—"}{proc.doctorName && ` · ${proc.doctorName}`}
                                </p>
                                <p className="text-[10px] font-bold text-[#dc2626] mt-0.5">
                                  {proc.price ? formatMoney(proc.price) : "—"} · <span className="text-[9px] text-[#dc2626] font-semibold">{fmtOverdueDate(proc)}</span>
                                </p>
                              </div>
                              {!isSelecting && (
                                <button
                                  onClick={() => setSelectingPayment(proc.id)}
                                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-[#fef2f2] text-[#dc2626] hover:bg-[#fef2f2]/80 transition-colors"
                                >
                                  <CheckCircle2 className="w-3 h-3 text-[#dc2626]" />
                                  Оплата
                                </button>
                              )}
                            </div>
                            {isSelecting && (
                              <div className="flex flex-wrap gap-1 mt-1 pl-1">
                                {(["cash", "kaspi_qr", "kaspi_transfer", "terminal", "kaspi_red", "debt"] as const).map((method) => (
                                  <button
                                    key={method}
                                    disabled={isSaving}
                                    onClick={() => updatePayment.mutate({ id: proc.id, data: { paymentMethod: method } })}
                                    className="px-1.5 py-0.5 text-[9px] font-medium rounded-md border border-[#e8e3d9] bg-white hover:border-[#1f75fe] hover:bg-[#1f75fe]/10 hover:text-[#1f75fe] transition-colors disabled:opacity-50"
                                  >
                                    {PAYMENT_METHOD_LABELS[method]}
                                  </button>
                                ))}
                                <button
                                  onClick={() => setSelectingPayment(null)}
                                  className="px-1.5 py-0.5 text-[9px] font-medium rounded-md border border-[#e8e3d9] text-[#94a3b8] bg-white hover:bg-[#f1ede4] transition-colors"
                                >
                                  Отмена
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Top Doctors */}
          <div className="bg-white rounded-2xl border border-[#e8e3d9] p-5 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#0f172a] flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-[#1f75fe]" />
                {t("adminDashboard.topDoctors")}
              </h3>
            </div>
            {topDoctors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <Stethoscope className="w-8 h-8 text-[#94a3b8] mb-2" />
                <p className="text-[#64748b] text-sm">{t("adminDashboard.noDoctor")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topDoctors.map((doc, i) => {
                  const pct = Math.round((doc.revenueTotal / maxRevenue) * 100);
                  return (
                    <div key={doc.doctorId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-[#94a3b8] w-4 shrink-0">{i + 1}</span>
                          <span className="text-sm font-medium text-[#0f172a] truncate">{doc.doctorName}</span>
                        </div>
                        <span className="text-xs font-bold text-[#16a34a] shrink-0 ml-2">
                          {formatMoney(doc.revenueTotal)}
                        </span>
                      </div>
                      <div className="w-full bg-[#f1ede4] rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: BRAND_BLUE }}
                        />
                      </div>
                      <p className="text-[10px] text-[#94a3b8] mt-0.5">
                        {doc.proceduresCount} {t("adminDashboard.procedures")} · {doc.patientsCount} {t("adminDashboard.patients")}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>



      {/* Quick Links row */}
      <div className="bg-white rounded-2xl border border-[#e8e3d9] p-6 shadow-md">
        <h3 className="text-base font-bold text-[#0f172a] mb-4">{t("dashboard.quickActions")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: t("adminNav.newAppointment"), icon: PlusCircle, path: "/admin/appointments/new" },
            { label: t("adminNav.calendar"),       icon: Calendar,   path: "/admin/calendar" },
            { label: t("adminNav.finance"),        icon: Wallet,     path: "/admin/finance" },
            { label: t("patients.tabKanban"),      icon: KanbanSquare, path: "/patients?view=kanban" },
            { label: t("nav.patients"),            icon: Users,      path: "/patients" },
            { label: t("nav.services"),            icon: Stethoscope, path: "/services" },
          ].map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-[#f1ede4] border border-[#e8e3d9] hover:border-[#1f75fe]/20 transition-all group text-center"
            >
              <div className="w-10 h-10 bg-[#1f75fe]/10 text-[#1f75fe] rounded-xl flex items-center justify-center group-hover:bg-[#1f75fe] group-hover:text-white transition-colors">
                <item.icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-[#64748b] group-hover:text-[#1f75fe] transition-colors leading-tight">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {showApptModal && (
        <AppointmentModal
          date={new Date()}
          procedure={null}
          patients={modalPatients}
          doctors={modalDoctors}
          templates={modalTemplates}
          onSave={(data) => apptSave.save(data, null)}
          onClose={() => setShowApptModal(false)}
          isSaving={apptSave.isSaving}
        />
      )}
    </div>
  );
}

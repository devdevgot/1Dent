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
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
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

const BRAND_GREEN = "#98cc1c";

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

  const activeTasks = procedures.filter((p) => p.status === "in_progress");

  const pendingPaymentQueue = procedures.filter((p) => {
    if (p.status !== "pending_payment") return false;
    const d = p.scheduledAt ? parseISO(p.scheduledAt) : null;
    return d ? d >= todayStart && d <= todayEnd : true;
  });

  const formatMoney = (v: number) => v.toLocaleString("ru-RU") + " ₸";

  const topDoctors = [...doctorKpis]
    .sort((a, b) => b.revenueTotal - a.revenueTotal)
    .slice(0, 5);

  const maxRevenue = topDoctors[0]?.revenueTotal ?? 1;


  return (
    <div className="space-y-6 p-6 pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {t("dashboard.welcomeBack", { name: user?.name.split(" ")[0] })}
          </h2>
          <p className="text-gray-500 mt-1">
            {t("adminDashboard.subtitle", { clinic: clinic?.name })}
          </p>
        </div>
        <button
          onClick={() => setShowApptModal(true)}
          className="px-5 py-2.5 bg-primary text-white font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all"
        >
          {t("adminNav.newAppointment")}
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Schedule */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              {t("adminDashboard.todaySchedule")}
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary ml-1">
                {todayProcedures.length}
              </span>
            </h3>
            <button
              onClick={() => navigate("/admin/calendar")}
              className="text-sm text-primary font-semibold flex items-center gap-1 hover:underline"
            >
              {t("dashboard.viewAll")} <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {todayProcedures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Calendar className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-gray-500 font-medium">{t("adminDashboard.noSchedule")}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
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
                      <span className="text-sm font-bold text-primary">{timeStr}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{proc.name}</p>
                      <p className="text-xs text-gray-500">
                        {patient?.name ?? "—"}
                        {proc.doctorName && ` · ${proc.doctorName}`}
                      </p>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 flex-none">
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
          {/* Active Tasks (in_progress procedures) */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-amber-500" />
              {t("adminDashboard.activeTasks")}
              {activeTasks.length > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-1">
                  {activeTasks.length}
                </span>
              )}
            </h3>
            {activeTasks.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">{t("adminDashboard.noActiveTasks")}</p>
            ) : (
              <div className="space-y-2">
                {activeTasks.slice(0, 4).map((proc) => {
                  const patient = patients.find((p) => p.id === proc.patientId);
                  return (
                    <div key={proc.id} className="flex items-center gap-2 p-2 rounded-xl bg-amber-50 border border-amber-100">
                      <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">{proc.name}</p>
                        <p className="text-[10px] text-gray-500 truncate">
                          {patient?.name ?? "—"}
                          {proc.doctorName && ` · ${proc.doctorName}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Doctors */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-primary" />
                {t("adminDashboard.topDoctors")}
              </h3>
            </div>
            {topDoctors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <Stethoscope className="w-8 h-8 text-gray-200 mb-2" />
                <p className="text-gray-500 text-sm">{t("adminDashboard.noDoctor")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topDoctors.map((doc, i) => {
                  const pct = Math.round((doc.revenueTotal / maxRevenue) * 100);
                  return (
                    <div key={doc.doctorId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-gray-400 w-4 shrink-0">{i + 1}</span>
                          <span className="text-sm font-medium text-gray-900 truncate">{doc.doctorName}</span>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 shrink-0 ml-2">
                          {formatMoney(doc.revenueTotal)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: BRAND_GREEN }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">
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

      {/* Pending Payment Queue */}
      {pendingPaymentQueue.length > 0 && (
        <div className="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-orange-100 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-orange-500" />
            <h3 className="text-base font-bold text-gray-900">Ожидают оплаты сегодня</h3>
            <span className="ml-1 text-xs font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
              {pendingPaymentQueue.length}
            </span>
            <button
              onClick={() => navigate("/admin/finance")}
              className="ml-auto text-sm text-primary font-semibold flex items-center gap-1 hover:underline"
            >
              Все <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-orange-50">
            {pendingPaymentQueue.map((proc, i) => {
              const patient = patients.find((p) => p.id === proc.patientId);
              const isSelecting = selectingPayment === proc.id;
              const isSaving = updatePayment.isPending;
              return (
                <motion.div
                  key={proc.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-4 px-5 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{proc.name}</p>
                    <p className="text-xs text-gray-500">
                      {patient?.name ?? "—"}
                      {proc.doctorName && ` · ${proc.doctorName}`}
                      {proc.price ? ` · ${formatMoney(proc.price)}` : ""}
                    </p>
                  </div>
                  {isSelecting ? (
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {(["cash", "kaspi_qr", "kaspi_transfer", "terminal", "kaspi_red", "debt"] as const).map((method) => (
                        <button
                          key={method}
                          disabled={isSaving}
                          onClick={() => updatePayment.mutate({ id: proc.id, data: { paymentMethod: method } })}
                          className="px-2 py-1 text-xs rounded-lg border border-gray-200 hover:border-primary hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
                        >
                          {PAYMENT_METHOD_LABELS[method]}
                        </button>
                      ))}
                      <button
                        onClick={() => setSelectingPayment(null)}
                        className="px-2 py-1 text-xs rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectingPayment(proc.id)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Принять оплату
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Links row */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <h3 className="text-base font-bold text-gray-900 mb-4">{t("dashboard.quickActions")}</h3>
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
              className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-gray-50 border border-gray-100 hover:border-primary/20 transition-all group text-center"
            >
              <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                <item.icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-gray-700 group-hover:text-primary transition-colors leading-tight">{item.label}</span>
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

import { useState, useMemo, useEffect } from "react";
import { SITE } from "@/config/site";
import "@/styles/dashboard.css";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useListProcedures,
  useListPatients,
  useListUsers,
  useListProcedureTemplates,
  useGetDoctorKpis,
  getGetDoctorKpisQueryKey,
  getListProceduresQueryKey,
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
import { AdminScheduleListSkeleton, Bone } from "@/components/skeletons";

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

  const { data: proceduresData, isLoading: proceduresLoading } = useListProcedures();
  const { data: patientsData } = useListPatients();
  const { data: usersData } = useListUsers();
  const { data: templateData } = useListProcedureTemplates();
  const { data: kpiData, isLoading: kpiLoading } = useGetDoctorKpis({
    query: { queryKey: getGetDoctorKpisQueryKey() },
  });

  const updatePayment = useUpdateProcedurePayment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProceduresQueryKey() });
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

  useEffect(() => {
    document.title = SITE.dashboardTitles.admin;
  }, []);

  return (
    <div className="dashboard-page min-h-full">
      <div className="dash-page-inner-lg dash-stack">
      <div className="dash-page-header">
        <div>
          <h2 className="dash-page-title">
            {t("dashboard.welcomeBack", { name: (user?.name || "").split(" ")[0] })}
          </h2>
          <p className="dash-page-subtitle">
            {t("adminDashboard.subtitle", { clinic: clinic?.name })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowApptModal(true)}
          className="dash-btn dash-btn-primary"
        >
          {t("adminNav.newAppointment")}
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Schedule */}
        <div className="lg:col-span-2 dash-card dash-card-padded dash-card-elevated">
          <div className="flex items-center justify-between mb-5">
            <h3 className="dash-section-title">
              <Clock className="w-4 h-4 text-[var(--ds-primary)]" />
              {t("adminDashboard.todaySchedule")}
              <span className="dash-badge dash-badge-primary ml-1">
                {todayProcedures.length}
              </span>
            </h3>
            <button
              type="button"
              onClick={() => navigate("/admin/calendar")}
              className="dash-link"
            >
              {t("dashboard.viewAll")} <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {proceduresLoading ? (
            <AdminScheduleListSkeleton rows={6} />
          ) : todayProcedures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Calendar className="w-10 h-10 text-[var(--text-subtle)] mb-3" />
              <p className="text-[var(--text-secondary)] font-medium">{t("adminDashboard.noSchedule")}</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--ds-border)]">
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
                      <span className="text-body font-bold text-[var(--ds-primary)]">{timeStr}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-semibold text-[var(--text)] truncate">{proc.name}</p>
                      <p className="text-caption text-[var(--text-secondary)]">
                        {patient?.name ?? "—"}
                        {proc.doctorName && ` · ${proc.doctorName}`}
                      </p>
                    </div>
                    <span className="text-caption font-bold px-2 py-0.5 rounded-full bg-[var(--info-light)] text-[var(--info)] flex-none">
                      {t("adminDashboard.scheduled")}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column: Payments + Top Doctors */}
        <div className="space-y-4">
          {/* Ожидают оплаты */}
          <div className="dash-card dash-card-padded-sm dash-card-elevated">
            <h3 className="dash-section-title mb-4">
              <Wallet className="w-4 h-4 text-[var(--success)]" />
              Оплата
              {pendingPaymentQueue.length > 0 && (
                <span className="dash-badge dash-badge-success ml-1">
                  {pendingPaymentQueue.length}
                </span>
              )}
            </h3>
            {proceduresLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Bone key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : pendingPaymentQueue.length === 0 ? (
              <p className="text-caption text-[var(--text-subtle)] py-2">Нет ожидающих оплат</p>
            ) : (
              <div className="space-y-4">
                {todayPendingPayment.length > 0 && (
                  <div>
                    <p className="text-micro font-bold text-[var(--success)] uppercase tracking-wide mb-1.5">Сегодня</p>
                    <div className="space-y-2">
                      {todayPendingPayment.map((proc) => {
                        const patient = patients.find((p) => p.id === proc.patientId);
                        const isSelecting = selectingPayment === proc.id;
                        const isSaving = updatePayment.isPending;
                        return (
                          <div key={proc.id} className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--success-light)]/50 border border-[var(--success-light)]">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-caption font-semibold text-[var(--text)] truncate">{proc.name}</p>
                                <p className="text-micro text-[var(--text-secondary)] truncate">
                                  {patient?.name ?? "—"}{proc.doctorName && ` · ${proc.doctorName}`}
                                </p>
                                <p className="text-micro font-bold text-[var(--success)] mt-0.5">
                                  {proc.price ? formatMoney(proc.price) : "—"}
                                </p>
                              </div>
                              {!isSelecting && (
                                <button
                                  onClick={() => setSelectingPayment(proc.id)}
                                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-micro font-semibold rounded-lg bg-[var(--success-light)] text-[var(--success)] hover:bg-[var(--success-light)]/80 transition-colors"
                                >
                                  <CheckCircle2 className="w-3 h-3 text-[var(--success)]" />
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
                                    className="px-1.5 py-0.5 text-micro font-medium rounded-md border border-[var(--ds-border)] bg-[var(--ds-surface)] hover:border-[var(--ds-primary)] hover:bg-[var(--primary-light)] hover:text-[var(--ds-primary)] transition-colors disabled:opacity-50"
                                  >
                                    {PAYMENT_METHOD_LABELS[method]}
                                  </button>
                                ))}
                                <button
                                  onClick={() => setSelectingPayment(null)}
                                  className="px-1.5 py-0.5 text-micro font-medium rounded-md border border-[var(--ds-border)] text-[var(--text-subtle)] bg-[var(--ds-surface)] hover:bg-[var(--surface-2)] transition-colors"
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
                    <p className="text-micro font-bold text-[var(--danger)] uppercase tracking-wide mb-1.5">Незакрытые</p>
                    <div className="space-y-2">
                      {overduePendingPayment.map((proc) => {
                        const patient = patients.find((p) => p.id === proc.patientId);
                        const isSelecting = selectingPayment === proc.id;
                        const isSaving = updatePayment.isPending;
                        return (
                          <div key={proc.id} className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--danger-light)]/50 border border-[var(--danger-light)]">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-caption font-semibold text-[var(--text)] truncate">{proc.name}</p>
                                <p className="text-micro text-[var(--text-secondary)] truncate">
                                  {patient?.name ?? "—"}{proc.doctorName && ` · ${proc.doctorName}`}
                                </p>
                                <p className="text-micro font-bold text-[var(--danger)] mt-0.5">
                                  {proc.price ? formatMoney(proc.price) : "—"} · <span className="text-micro text-[var(--danger)] font-semibold">{fmtOverdueDate(proc)}</span>
                                </p>
                              </div>
                              {!isSelecting && (
                                <button
                                  onClick={() => setSelectingPayment(proc.id)}
                                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-micro font-semibold rounded-lg bg-[var(--danger-light)] text-[var(--danger)] hover:bg-[var(--danger-light)]/80 transition-colors"
                                >
                                  <CheckCircle2 className="w-3 h-3 text-[var(--danger)]" />
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
                                    className="px-1.5 py-0.5 text-micro font-medium rounded-md border border-[var(--ds-border)] bg-[var(--ds-surface)] hover:border-[var(--ds-primary)] hover:bg-[var(--primary-light)] hover:text-[var(--ds-primary)] transition-colors disabled:opacity-50"
                                  >
                                    {PAYMENT_METHOD_LABELS[method]}
                                  </button>
                                ))}
                                <button
                                  onClick={() => setSelectingPayment(null)}
                                  className="px-1.5 py-0.5 text-micro font-medium rounded-md border border-[var(--ds-border)] text-[var(--text-subtle)] bg-[var(--ds-surface)] hover:bg-[var(--surface-2)] transition-colors"
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
          <div className="dash-card dash-card-padded-sm dash-card-elevated">
            <div className="flex items-center justify-between mb-4">
              <h3 className="dash-section-title">
                <Stethoscope className="w-4 h-4 text-[var(--ds-primary)]" />
                {t("adminDashboard.topDoctors")}
              </h3>
            </div>
            {kpiLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <Bone className="h-4 w-32 rounded" />
                      <Bone className="h-4 w-16 rounded" />
                    </div>
                    <Bone className="h-1.5 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ) : topDoctors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <Stethoscope className="w-8 h-8 text-[var(--text-subtle)] mb-2" />
                <p className="text-[var(--text-secondary)] text-sm">{t("adminDashboard.noDoctor")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topDoctors.map((doc, i) => {
                  const pct = Math.round((doc.revenueTotal / maxRevenue) * 100);
                  return (
                    <div key={doc.doctorId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-caption font-bold text-[var(--text-subtle)] w-4 shrink-0">{i + 1}</span>
                          <span className="text-body font-medium text-[var(--text)] truncate">{doc.doctorName}</span>
                        </div>
                        <span className="text-caption font-bold text-[var(--success)] shrink-0 ml-2">
                          {formatMoney(doc.revenueTotal)}
                        </span>
                      </div>
                      <div className="w-full bg-[var(--surface-2)] rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: BRAND_BLUE }}
                        />
                      </div>
                      <p className="text-micro text-[var(--text-subtle)] mt-0.5">
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
      <div className="dash-card dash-card-padded dash-card-elevated">
        <h3 className="dash-section-title mb-4">{t("dashboard.quickActions")}</h3>
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
              type="button"
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-[var(--surface-2)] border border-[var(--ds-border)] hover:border-[var(--ds-primary)]/25 transition-all group text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]"
            >
              <div className="dash-quick-action-icon w-10 h-10">
                <item.icon className="w-5 h-5" />
              </div>
              <span className="text-caption font-medium text-[var(--text-secondary)] group-hover:text-[var(--ds-primary)] transition-colors leading-tight">{item.label}</span>
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
    </div>
  );
}

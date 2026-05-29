import { useState } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useListUsersAll,
  getListUsersAllQueryKey,
  useDeleteUser,
  useUpdateUser,
  useUpdateUserStatus,
  useUpdateSalarySettings,
  usePatchUserCapacity,
  useGetDoctorKpis,
} from "@workspace/api-client-react";
import type { User, SalaryType } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Phone, Calendar, Briefcase,
  ChevronRight, ChevronLeft, MoreVertical, UserCheck, UserX,
  Trash2, Users, SlidersHorizontal, BarChart2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Button } from "@/components/ui/button";
import EmployeeDialog, { type EmployeeFormData } from "./employee-dialog";
import InviteStaffDialog from "./invite-staff-dialog";
import { cn } from "@/lib/utils";

const ROLES = ["admin", "doctor", "accountant", "warehouse"] as const;

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  owner:      { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  admin:      { bg: "bg-blue-100",   text: "text-blue-700",   border: "border-blue-200" },
  doctor:     { bg: "bg-emerald-100",text: "text-emerald-700",border: "border-emerald-200" },
  accountant: { bg: "bg-amber-100",  text: "text-amber-700",  border: "border-amber-200" },
  warehouse:  { bg: "bg-slate-100",  text: "text-slate-700",  border: "border-slate-200" },
};

const ROLE_STRIP: Record<string, string> = {
  owner:      "bg-purple-400",
  admin:      "bg-blue-400",
  doctor:     "bg-emerald-400",
  accountant: "bg-amber-400",
  warehouse:  "bg-slate-400",
};

const AVATAR_COLORS: Record<string, string> = {
  owner:      "#7c3aed",
  admin:      "#2563eb",
  doctor:     "#059669",
  accountant: "#d97706",
  warehouse:  "#6b7280",
};

function initials(name: string) {
  return name.split(" ").map((w) => w[0]?.toUpperCase() ?? "").slice(0, 2).join("");
}

function fmtSalaryShort(user: User): string {
  const s = user.salarySettings;
  if (!s) return "—";
  const type = s.salaryType as string;
  const fixed = Number(s.fixedAmount);
  const pct = Number(s.commissionPercent);
  if (type === "fixed")                  return `${fixed.toLocaleString("ru-KZ")} ₸/мес`;
  if (type === "commission")             return `${pct}%`;
  if (type === "hourly")                 return `${fixed.toLocaleString("ru-KZ")} ₸/час`;
  return `${fixed.toLocaleString("ru-KZ")} ₸ + ${pct}%`;
}

function fmtHireDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru", { day: "numeric", month: "short", year: "numeric" });
}

function UserActionMenu({
  user,
  currentUserId,
  currentRole,
  onEdit,
  onDelete,
  onToggleActive,
  onNavigate,
}: {
  user: User;
  currentUserId: string;
  currentRole: string;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const isSelf = user.id === currentUserId;

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.1 }}
              className="absolute right-0 top-9 z-20 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 min-w-[160px]"
            >
              <button
                onClick={() => { setOpen(false); onEdit(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                {t("common.edit")}
              </button>
              {user.role === "doctor" && (
                <button
                  onClick={() => { setOpen(false); onNavigate(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  {t("employees.analytics", "Аналитика")}
                </button>
              )}
              {!isSelf && user.role !== "owner" && (currentRole === "owner" || currentRole === "admin") && (
                <button
                  onClick={() => { setOpen(false); onToggleActive(); }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50",
                    user.isActive ? "text-amber-600" : "text-emerald-600",
                  )}
                >
                  {user.isActive
                    ? <><UserX className="w-3.5 h-3.5" /> {t("employees.deactivate", "Деактивировать")}</>
                    : <><UserCheck className="w-3.5 h-3.5" /> {t("employees.activate", "Активировать")}</>}
                </button>
              )}
              {!isSelf && currentRole === "owner" && user.role !== "owner" && (
                <button
                  onClick={() => { setOpen(false); onDelete(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t("common.delete")}
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function StaffPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuthStore();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"staff" | "analytics">("staff");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data, isLoading } = useListUsersAll(
    { includeInactive: showInactive },
    { query: { queryKey: getListUsersAllQueryKey(showInactive) } },
  );

  const { data: kpiData, isLoading: kpiLoading } = useGetDoctorKpis();
  const doctors = kpiData?.data?.kpis ?? [];

  const rawUsers = (data?.data?.users ?? []) as User[];

  const filtered = rawUsers.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListUsersAllQueryKey(showInactive) });

  const updateMutation = useUpdateUser({
    mutation: {
      onSuccess: () => {
        invalidate();
        setEditDialogOpen(false);
        setEditingUser(null);
        toast.success(t("employees.updated", "Данные обновлены"));
      },
      onError: () => toast.error(t("employees.updateError", "Ошибка обновления")),
    },
  });

  const updateSalaryMutation = useUpdateSalarySettings({
    mutation: { onSuccess: () => invalidate() },
  });

  const capacityMutation = usePatchUserCapacity({
    mutation: { onSuccess: () => invalidate() },
  });

  const statusMutation = useUpdateUserStatus({
    mutation: {
      onSuccess: (_, vars) => {
        invalidate();
        toast.success(vars.isActive
          ? t("employees.activated", "Активирован")
          : t("employees.deactivated", "Деактивирован"),
        );
      },
      onError: () => toast.error(t("employees.statusError", "Ошибка изменения статуса")),
    },
  });

  const deleteMutation = useDeleteUser({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDeleteConfirmId(null);
        toast.success(t("users.deleteSuccess"));
      },
      onError: () => toast.error(t("users.deleteError")),
    },
  });

  const isOwnerOrAdmin = currentUser?.role === "owner" || currentUser?.role === "admin";

  const handleEditSave = async (formData: EmployeeFormData) => {
    if (!editingUser) return;
    await updateMutation.mutateAsync({
      id: editingUser.id,
      data: {
        name: formData.name,
        role: formData.role,
        phone: formData.phone || null,
        position: formData.role === "doctor"
          ? (formData.specialties[0] || null)
          : (formData.position || null),
        specialty: formData.role === "doctor"
          ? (formData.specialties.join(", ") || null)
          : null,
        hireDate: formData.hireDate || null,
        password: formData.password || undefined,
      },
    });
    if (isOwnerOrAdmin) {
      await updateSalaryMutation.mutateAsync({
        userId: editingUser.id,
        data: {
          salaryType: formData.salaryType as SalaryType,
          fixedAmount: formData.salaryType === "hourly" ? formData.hourlyRate : formData.fixedAmount,
          commissionPercent: formData.commissionPercent,
        },
      });
    }
    if (formData.role === "doctor" && formData.maxPatientsChanged) {
      await capacityMutation.mutateAsync({
        id: editingUser.id,
        data: { maxPatientsPerDay: formData.maxPatientsPerDay },
      });
    }
    if (formData.isActive !== (editingUser.isActive !== false)) {
      await statusMutation.mutateAsync({ id: editingUser.id, isActive: formData.isActive });
    }
  };

  const isSaving = updateMutation.isPending;

  return (
    <div className="min-h-full bg-[#f7f8fc] pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.history.back()}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-gray-900">Сотрудники</h1>
                {!isLoading && activeTab === "staff" && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    {filtered.length}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === "staff" && (
              <>
                <button
                  onClick={() => setShowFilters((v) => !v)}
                  className={cn(
                    "relative transition-colors p-1.5",
                    showFilters || search || roleFilter !== "all" || showInactive
                      ? "text-primary"
                      : "text-gray-400 hover:text-primary",
                  )}
                  title="Фильтры"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  {(search || roleFilter !== "all" || showInactive) && (
                    <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-primary rounded-full" />
                  )}
                </button>
                {isOwnerOrAdmin && (
                  <Button onClick={() => setInviteOpen(true)} className="gap-1.5 h-8 text-xs px-2.5 sm:px-3">
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Добавить сотрудника</span>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0">
          <button
            onClick={() => setActiveTab("staff")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors",
              activeTab === "staff"
                ? "border-primary text-primary"
                : "border-transparent text-gray-400 hover:text-gray-600",
            )}
          >
            <Users className="w-3.5 h-3.5" />
            Сотрудники
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors",
              activeTab === "analytics"
                ? "border-primary text-primary"
                : "border-transparent text-gray-400 hover:text-gray-600",
            )}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Аналитика
          </button>
        </div>

        {/* Filter panel (staff tab only) */}
        {activeTab === "staff" && showFilters && (
          <div className="mt-2.5 space-y-2.5 border-t border-gray-100 pt-2.5 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по имени или email..."
                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              {["all", ...ROLES].map((r) => {
                const colors = r !== "all" ? ROLE_COLORS[r] : null;
                const isActive = roleFilter === r;
                return (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(r)}
                    className={cn(
                      "shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                      isActive
                        ? colors
                          ? `${colors.bg} ${colors.text} ${colors.border}`
                          : "bg-gray-900 text-white border-gray-900"
                        : "bg-gray-50 text-gray-500 border-gray-200",
                    )}
                  >
                    {r === "all" ? "Все" : t(`role.${r}`, r)}
                  </button>
                );
              })}
            </div>
            {currentUser?.role === "owner" && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="text-xs text-gray-600">Показать неактивных</span>
              </label>
            )}
          </div>
        )}
      </div>

      {/* ── Analytics tab ──────────────────────────────────────── */}
      {activeTab === "analytics" && (
        <div className="px-4 pt-4 pb-8">
          {kpiLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : doctors.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <BarChart2 className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-sm font-bold text-gray-500">Нет данных по врачам</p>
              <p className="text-xs text-gray-300 mt-1">Добавьте врача и назначьте процедуры</p>
            </div>
          ) : (
            <div className="space-y-3">
              {doctors.map((doc, i) => (
                <motion.button
                  key={doc.doctorId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => navigate(`/staff/${doc.doctorId}`)}
                  className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all duration-200 text-left"
                >
                  <div className="h-1 w-full bg-primary/30" />
                  <div className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm"
                        style={{ backgroundColor: AVATAR_COLORS["doctor"] }}
                      >
                        {doc.doctorName.split(" ").map((w: string) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{doc.doctorName}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-700 border-emerald-200">
                          {t("role.doctor")}
                        </span>
                      </div>
                      <div className={cn(
                        "text-sm font-bold px-2.5 py-1 rounded-xl",
                        doc.nps >= 70 ? "bg-emerald-100 text-emerald-700" :
                        doc.nps >= 50 ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700",
                      )}>
                        NPS {doc.nps}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">Пациентов</p>
                        <p className="text-sm font-bold text-gray-800">{doc.patientsCount}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">Процедур</p>
                        <p className="text-sm font-bold text-gray-800">{doc.proceduresCount}</p>
                      </div>
                      <div className="bg-primary/5 rounded-xl px-3 py-2 text-center">
                        <p className="text-[10px] text-primary/70 mb-0.5">Выручка</p>
                        <p className="text-sm font-bold text-primary">{(doc.revenueTotal / 1000).toFixed(0)}K ₸</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2.5 px-1">
                      <span className="text-xs text-gray-400">
                        Средний чек: <span className="font-semibold text-gray-600">{Math.round(doc.averageCheck).toLocaleString("ru-KZ")} ₸</span>
                      </span>
                      <span className="text-xs text-primary font-semibold flex items-center gap-0.5">
                        Подробнее <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Staff list tab ─────────────────────────────────────── */}
      {activeTab === "staff" && <div className="px-4 pt-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-sm font-bold text-gray-500">Сотрудников пока нет</p>
            <p className="text-xs text-gray-300 mt-1">
              {search ? "Попробуйте другой запрос" : "Нажмите «+ Добавить сотрудника»"}
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {filtered.map((u, i) => {
              const colors = ROLE_COLORS[u.role] ?? ROLE_COLORS["warehouse"];
              const avatarColor = AVATAR_COLORS[u.role] ?? "#6b7280";
              const isSelf = u.id === currentUser?.id;
              const isInactive = u.isActive === false;

              const stripColor = ROLE_STRIP[u.role] ?? "bg-slate-400";

              return (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={cn(
                    "bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200",
                    isInactive && "opacity-55",
                  )}
                >
                  {/* Role accent strip */}
                  <div className={cn("h-1 w-full rounded-t-2xl", stripColor)} />

                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Circular avatar */}
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md ring-2 ring-white"
                        style={{ backgroundColor: avatarColor }}
                      >
                        {initials(u.name)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {/* Name row */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-bold text-gray-900 truncate">{u.name}</p>
                              {isSelf && (
                                <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full shrink-0">
                                  Вы
                                </span>
                              )}
                              {isInactive && (
                                <span className="text-[10px] bg-gray-100 text-gray-400 font-semibold px-1.5 py-0.5 rounded-full shrink-0">
                                  Неактивен
                                </span>
                              )}
                            </div>
                            {/* Role + position inline */}
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={cn(
                                "inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border shrink-0",
                                colors.bg, colors.text, colors.border,
                              )}>
                                {t(`role.${u.role}`)}
                              </span>
                              {(u.position || u.specialty) && (
                                <span className="text-xs text-gray-400 truncate">
                                  {u.specialty || u.position}
                                </span>
                              )}
                            </div>
                          </div>

                          <UserActionMenu
                            user={u}
                            currentUserId={currentUser?.id ?? ""}
                            currentRole={currentUser?.role ?? ""}
                            onEdit={() => { setEditingUser(u); setEditDialogOpen(true); }}
                            onDelete={() => setDeleteConfirmId(u.id)}
                            onToggleActive={() => statusMutation.mutate({ id: u.id, isActive: !u.isActive })}
                            onNavigate={() => navigate(`/staff/${u.id}`)}
                          />
                        </div>

                        {/* Details row — horizontal */}
                        {(u.phone || u.hireDate || u.salarySettings) && (
                          <div className="mt-2.5 flex items-center gap-3 flex-wrap">
                            {u.phone && (
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                <Phone className="w-3 h-3 shrink-0" />
                                {u.phone}
                              </span>
                            )}
                            {u.hireDate && (
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                <Calendar className="w-3 h-3 shrink-0" />
                                с {fmtHireDate(u.hireDate)}
                              </span>
                            )}
                            {u.salarySettings && (
                              <span className="flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
                                {fmtSalaryShort(u)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>}

      {/* Invite staff dialog (for new staff) */}
      <InviteStaffDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />

      {/* Edit staff dialog */}
      <EmployeeDialog
        open={editDialogOpen}
        onClose={() => { setEditDialogOpen(false); setEditingUser(null); }}
        onSave={handleEditSave}
        isSaving={isSaving}
        editUser={editingUser}
      />

      <ConfirmDeleteDialog
        open={!!deleteConfirmId}
        onConfirm={() => { if (deleteConfirmId) deleteMutation.mutate({ id: deleteConfirmId }); }}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
}

import { useState, useMemo } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useListUsersAll,
  getListUsersAllQueryKey,
  useDeleteUser,
  useUpdateUser,
  useUpdateUserStatus,
  useUpdateSalarySettings,
  usePatchUserCapacity,
} from "@workspace/api-client-react";
import type { User, SalaryType } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Phone, Calendar, Briefcase,
  ChevronRight, ChevronLeft, MoreVertical, UserCheck, UserX,
  Trash2, Users, SlidersHorizontal, BarChart2,
  Mail, Shield, Activity, TrendingUp,
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

const ROLES = ["admin", "doctor", "accountant", "warehouse", "assistant", "nurse"] as const;

const ROLE_LABELS: Record<string, string> = {
  all: "Все",
  owner: "Владелец",
  admin: "Админ",
  doctor: "Врач",
  accountant: "Бухгалтер",
  warehouse: "Склад",
  assistant: "Ассистент",
  nurse: "Медсестра",
};

const ROLE_ICONS: Record<string, typeof Shield> = {
  owner: Shield,
  admin: Shield,
  doctor: Activity,
  accountant: Briefcase,
  warehouse: Briefcase,
  assistant: Users,
  nurse: Activity,
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

/* ── Action menu per user row ─────────────────────────────── */
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
        className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-primary/5 hover:text-primary transition-all duration-200"
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
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-9 z-20 bg-white rounded-2xl shadow-2xl border border-gray-100/80 py-2 min-w-[180px] backdrop-blur-xl"
            >
              <button
                onClick={() => { setOpen(false); onEdit(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-primary/5 hover:text-primary transition-colors"
              >
                <Briefcase className="w-4 h-4" />
                {t("common.edit")}
              </button>
              {user.role !== "owner" && (
                <button
                  onClick={() => { setOpen(false); onNavigate(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-primary/5 hover:text-primary transition-colors"
                >
                  <BarChart2 className="w-4 h-4" />
                  {t("employees.analytics", "Аналитика")}
                </button>
              )}
              {!isSelf && user.role !== "owner" && (currentRole === "owner" || currentRole === "admin") && (
                <button
                  onClick={() => { setOpen(false); onToggleActive(); }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                    user.isActive ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50",
                  )}
                >
                  {user.isActive
                    ? <><UserX className="w-4 h-4" /> {t("employees.deactivate", "Деактивировать")}</>
                    : <><UserCheck className="w-4 h-4" /> {t("employees.activate", "Активировать")}</>}
                </button>
              )}
              {!isSelf && currentRole === "owner" && user.role !== "owner" && (
                <>
                  <div className="my-1 border-t border-gray-100" />
                  <button
                    onClick={() => { setOpen(false); onDelete(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t("common.delete")}
                  </button>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────── */
export default function StaffPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuthStore();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

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

  const rawUsers = (data?.data?.users ?? []) as User[];

  const filtered = rawUsers.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  /* Role counts for filter pills */
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rawUsers.length };
    for (const u of rawUsers) {
      counts[u.role] = (counts[u.role] ?? 0) + 1;
    }
    return counts;
  }, [rawUsers]);

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
        position: (formData.role === "doctor" || formData.role === "assistant" || formData.role === "nurse")
          ? (formData.specialties[0] || null)
          : (formData.position || null),
        specialty: (formData.role === "doctor" || formData.role === "assistant" || formData.role === "nurse")
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
    <div className="min-h-full bg-[#f7f8fc]">
      {/* ── Premium Header ───────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100">
        {/* Top accent line */}
        <div className="h-1 w-full bg-gradient-to-r from-primary via-primary/80 to-primary/40" />

        <div className="px-5 pt-5 pb-5">
          {/* Title + Actions row */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 font-display tracking-tight">
                Сотрудники
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {!isLoading && `${rawUsers.length} сотрудников в системе`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={cn(
                  "relative w-9 h-9 rounded-xl flex items-center justify-center border transition-all duration-200",
                  showFilters || search || roleFilter !== "all" || showInactive
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-white text-gray-400 border-gray-200/80 hover:text-primary hover:border-primary/20",
                )}
                title="Фильтры"
              >
                <SlidersHorizontal className="w-4 h-4" />
                {(search || roleFilter !== "all" || showInactive) && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-primary rounded-full border-2 border-white" />
                )}
              </button>
              {isOwnerOrAdmin && (
                <Button
                  onClick={() => setInviteOpen(true)}
                  size="icon"
                  className="w-9 h-9 rounded-xl shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-200"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Staff tab content ─────────────────────────────────── */}
      <div className="px-5 pt-4 pb-8">
          {/* Collapsible Filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 mb-4">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Поиск по имени или email..."
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200/80 rounded-xl text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all shadow-sm"
                    />
                  </div>

                  {/* Role pills + inactive toggle */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {["all", ...ROLES].map((r) => {
                      const isActive = roleFilter === r;
                      const count = roleCounts[r] ?? 0;
                      return (
                        <button
                          key={r}
                          onClick={() => setRoleFilter(r)}
                          className={cn(
                            "shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200",
                            isActive
                              ? "bg-primary text-white border-primary shadow-md shadow-primary/20"
                              : "bg-white text-gray-500 border-gray-200/80 hover:border-primary/30 hover:text-primary hover:bg-primary/5",
                          )}
                        >
                          {r === "all" ? "Все" : t(`role.${r}`, ROLE_LABELS[r] ?? r)}
                          {count > 0 && (
                            <span className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded-md min-w-[18px] text-center",
                              isActive ? "bg-white/25" : "bg-gray-100 text-gray-400",
                            )}>
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {currentUser?.role === "owner" && (
                      <label className="shrink-0 flex items-center gap-2 cursor-pointer select-none ml-auto pl-3 border-l border-gray-200">
                        <input
                          type="checkbox"
                          checked={showInactive}
                          onChange={(e) => setShowInactive(e.target.checked)}
                          className="w-3.5 h-3.5 rounded accent-primary"
                        />
                        <span className="text-xs text-gray-400 whitespace-nowrap">Неактивные</span>
                      </label>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Staff table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20"
            >
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mx-auto mb-5">
                <Users className="w-10 h-10 text-primary/40" />
              </div>
              <p className="text-base font-bold text-gray-500">Сотрудников не найдено</p>
              <p className="text-sm text-gray-300 mt-1.5 max-w-xs mx-auto">
                {search ? "Попробуйте изменить запрос поиска" : "Нажмите «+» чтобы добавить сотрудника"}
              </p>
            </motion.div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100/80 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50/80 backdrop-blur-sm border-b border-gray-100 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-10">#</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Сотрудник</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Роль</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Телефон</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Email</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Дата найма</th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Зарплата</th>
                      <th className="px-4 py-3 w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((u, idx) => {
                      const isSelf = u.id === currentUser?.id;
                      const isInactive = u.isActive === false;
                      const RoleIcon = ROLE_ICONS[u.role] ?? Briefcase;

                      return (
                        <tr
                          key={u.id}
                          onClick={() => {
                            if (u.role !== "owner") {
                              navigate(`/staff/${u.id}`);
                            }
                          }}
                          className={cn(
                            "bg-white hover:bg-primary/[0.03] transition-colors group",
                            u.role !== "owner" && "cursor-pointer",
                            isInactive && "opacity-50",
                          )}
                        >
                          {/* # */}
                          <td className="px-4 py-3.5 text-gray-300 text-xs font-mono">{idx + 1}</td>

                          {/* Name + avatar */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="relative shrink-0">
                                <div
                                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-sm"
                                  style={{
                                    background: "linear-gradient(135deg, #1f75fe 0%, #4d94ff 100%)",
                                  }}
                                >
                                  {initials(u.name)}
                                </div>
                                {!isInactive && (
                                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-[1.5px] border-white" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-primary transition-colors">
                                    {u.name}
                                  </p>
                                  {isSelf && (
                                    <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-md shrink-0">
                                      Вы
                                    </span>
                                  )}
                                  {isInactive && (
                                    <span className="text-[10px] bg-gray-100 text-gray-400 font-semibold px-1.5 py-0.5 rounded-md shrink-0">
                                      Неактивен
                                    </span>
                                  )}
                                </div>
                                {(u.position || u.specialty) && (
                                  <p className="text-[11px] text-gray-400 truncate max-w-[180px]">
                                    {u.specialty || u.position}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Role */}
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-primary/8 text-primary border border-primary/10 whitespace-nowrap">
                              <RoleIcon className="w-3 h-3" />
                              {t(`role.${u.role}`, ROLE_LABELS[u.role] ?? u.role)}
                            </span>
                          </td>

                          {/* Phone */}
                          <td className="px-4 py-3.5 hidden sm:table-cell">
                            {u.phone ? (
                              <span className="font-mono text-xs text-gray-600">{u.phone}</span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>

                          {/* Email */}
                          <td className="px-4 py-3.5 hidden md:table-cell">
                            {u.email ? (
                              <span className="text-xs text-gray-500 truncate max-w-[160px] block">{u.email}</span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>

                          {/* Hire date */}
                          <td className="px-4 py-3.5 hidden lg:table-cell text-xs text-gray-500 whitespace-nowrap">
                            {u.hireDate ? (
                              <span>с {fmtHireDate(u.hireDate)}</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>

                          {/* Salary */}
                          <td className="px-4 py-3.5 hidden lg:table-cell">
                            {u.salarySettings ? (
                              <span className="text-xs font-semibold text-primary bg-primary/8 px-2.5 py-1 rounded-lg inline-block">
                                {fmtSalaryShort(u)}
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                            <UserActionMenu
                              user={u}
                              currentUserId={currentUser?.id ?? ""}
                              currentRole={currentUser?.role ?? ""}
                              onEdit={() => { setEditingUser(u); setEditDialogOpen(true); }}
                              onDelete={() => setDeleteConfirmId(u.id)}
                              onToggleActive={() => statusMutation.mutate({ id: u.id, isActive: !u.isActive })}
                              onNavigate={() => navigate(`/staff/${u.id}`)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer with count */}
              <div className="bg-gray-50/50 border-t border-gray-100 px-5 py-2.5 text-xs text-gray-400">
                Показано {filtered.length} из {rawUsers.length} сотрудников
              </div>
            </div>
          )}
        </div>

      {/* ── Dialogs ───────────────────────────────────────────── */}
      <InviteStaffDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />

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

import { useState, useMemo, lazy, Suspense } from "react";
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
import type { User, SalaryType, UsersListResponse } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search, Phone, Calendar, Briefcase,
  ChevronRight, MoreVertical, UserCheck, UserX,
  Trash2, Users, SlidersHorizontal, BarChart2,
  Mail, Shield, Activity, TrendingUp, RefreshCw,
} from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader, PageHeaderAddButton, PageHeaderIconButton } from "@/components/layout/page-header";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EmployeeFormData } from "./employee-dialog";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const EmployeeDialog = lazy(() => import("./employee-dialog"));
const InviteStaffDialog = lazy(() => import("./invite-staff-dialog"));

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

function initials(name: string | null | undefined) {
  if (!name) return "";
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

/* ── Action menu per user row (portal — not clipped by table overflow) ── */
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
  const isSelf = user.id === currentUserId;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-subtle)] hover:bg-[var(--ds-primary)]/10 hover:text-[var(--ds-primary)] transition-all duration-200"
          aria-label={t("common.actions", "Действия")}
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={6}
        collisionPadding={12}
        className="min-w-[180px] rounded-2xl border border-[var(--ds-border)] p-2 shadow-lg font-manrope"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="gap-3 rounded-xl px-4 py-2.5 cursor-pointer"
        >
          <Briefcase className="w-4 h-4" />
          {t("common.edit")}
        </DropdownMenuItem>
        {user.role !== "owner" && (
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onNavigate(); }}
            className="gap-3 rounded-xl px-4 py-2.5 cursor-pointer"
          >
            <BarChart2 className="w-4 h-4" />
            {t("employees.analytics", "Аналитика")}
          </DropdownMenuItem>
        )}
        {!isSelf && user.role !== "owner" && (currentRole === "owner" || currentRole === "admin") && (
          <DropdownMenuItem
            onClick={(e) => { e.stopPropagation(); onToggleActive(); }}
            className={cn(
              "gap-3 rounded-xl px-4 py-2.5 cursor-pointer",
              user.isActive ? "text-[var(--warning)] focus:text-[var(--warning)] focus:bg-[#fef3c7]" : "text-[var(--success)] focus:text-[var(--success)] focus:bg-[#f0fdf4]",
            )}
          >
            {user.isActive
              ? <><UserX className="w-4 h-4" /> {t("employees.deactivate", "Деактивировать")}</>
              : <><UserCheck className="w-4 h-4" /> {t("employees.activate", "Активировать")}</>}
          </DropdownMenuItem>
        )}
        {!isSelf && currentRole === "owner" && user.role !== "owner" && (
          <>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="gap-3 rounded-xl px-4 py-2.5 text-[var(--danger)] focus:text-[var(--danger)] focus:bg-[#fef2f2] cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              {t("common.delete")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StaffTableSkeleton() {
  return (
    <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md overflow-hidden">
      <div className="min-w-[720px]">
        <div className="bg-[var(--bg)] border-b border-[var(--ds-border)] px-4 py-3 flex gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1 rounded bg-[var(--surface-2)]" />
          ))}
        </div>
        <div className="divide-y divide-[#e8e3d9]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3.5 flex items-center gap-3">
              <Skeleton className="w-9 h-9 rounded-xl shrink-0 bg-[var(--surface-2)]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40 rounded bg-[var(--surface-2)]" />
                <Skeleton className="h-3 w-24 rounded bg-[var(--surface-2)]" />
              </div>
              <Skeleton className="h-6 w-16 rounded-lg bg-[var(--surface-2)]" />
            </div>
          ))}
        </div>
      </div>
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
  const hasActiveFilter = !!(search || roleFilter !== "all" || showInactive);

  const { data, isLoading } = useListUsersAll(
    { includeInactive: showInactive },
    {
      query: {
        queryKey: getListUsersAllQueryKey(showInactive),
        staleTime: 5 * 60_000,
        placeholderData: () =>
          (queryClient.getQueryData(getListUsersAllQueryKey(!showInactive)) ??
            queryClient.getQueryData(["/api/users"])) as UsersListResponse | undefined,
      },
    },
  );

  const rawUsers = (data?.data?.users ?? []) as User[];
  const showTableSkeleton = isLoading && rawUsers.length === 0;

  const filtered = rawUsers.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
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
      onSuccess: () => invalidate(),
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
    try {
      await updateMutation.mutateAsync({
        id: editingUser.id,
        data: {
          name: formData.name,
          ...(editingUser.role !== "owner" ? { role: formData.role as any } : {}),
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
      if (formData.isActive !== (editingUser.isActive !== false) && editingUser.role !== "owner") {
        await statusMutation.mutateAsync({ id: editingUser.id, isActive: formData.isActive });
      }
      setEditDialogOpen(false);
      setEditingUser(null);
      toast.success(t("employees.updated", "Данные обновлены"));
    } catch {
      // Individual mutation onError handlers surface API failures.
    }
  };

  const isSaving =
    updateMutation.isPending
    || updateSalaryMutation.isPending
    || capacityMutation.isPending
    || statusMutation.isPending;

  return (
    <PageShell animate={false}>
      <PageHeader
        title="Сотрудники"
        subtitle={rawUsers.length > 0 ? `${rawUsers.length} сотрудников в системе` : undefined}
        onBack={() => navigate("/menu")}
        right={
          <>
            <PageHeaderIconButton
              onClick={() => queryClient.invalidateQueries({ queryKey: getListUsersAllQueryKey(showInactive) })}
              title="Обновить"
            >
              <RefreshCw className="w-4 h-4" />
            </PageHeaderIconButton>
            <PageHeaderIconButton
              onClick={() => setShowFilters((v) => !v)}
              active={showFilters || hasActiveFilter}
              title="Фильтры"
              className="relative"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {hasActiveFilter && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-[var(--ds-primary)] rounded-full" />
              )}
            </PageHeaderIconButton>
            {isOwnerOrAdmin && (
              <PageHeaderAddButton
                onClick={() => setInviteOpen(true)}
                title="Пригласить"
              />
            )}
          </>
        }
      />

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
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-subtle)]" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Поиск по имени или email..."
                      className="w-full pl-10 pr-4 py-2.5 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-xl text-body text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-primary)]/20 focus:border-[var(--ds-primary)] transition-all shadow-sm"
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
                            "shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-caption font-semibold border transition-all duration-200",
                            isActive
                              ? "bg-[var(--ds-primary)] text-white border-[var(--ds-primary)] shadow-md"
                              : "bg-[var(--ds-surface)] text-[var(--text-secondary)] border-[var(--ds-border)] hover:border-[var(--ds-primary)]/30 hover:text-[var(--ds-primary)] hover:bg-[var(--ds-primary)]/5",
                          )}
                        >
                          {r === "all" ? "Все" : t(`role.${r}`, ROLE_LABELS[r] ?? r)}
                          {count > 0 && (
                            <span className={cn(
                              "text-micro font-bold px-1.5 py-0.5 rounded-md min-w-[18px] text-center",
                              isActive ? "bg-[var(--ds-surface)]/25" : "bg-[var(--surface-2)] text-[var(--text-subtle)]",
                            )}>
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {currentUser?.role === "owner" && (
                      <label className="shrink-0 flex items-center gap-2 cursor-pointer select-none ml-auto pl-3 border-l border-[var(--ds-border)]">
                        <input
                          type="checkbox"
                          checked={showInactive}
                          onChange={(e) => setShowInactive(e.target.checked)}
                          className="w-3.5 h-3.5 rounded accent-[#1f75fe]"
                        />
                        <span className="text-caption text-[var(--text-subtle)] whitespace-nowrap">Неактивные</span>
                      </label>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Staff table */}
          {showTableSkeleton ? (
            <StaffTableSkeleton />
          ) : filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20"
            >
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#1f75fe]/10 to-[#1f75fe]/5 flex items-center justify-center mx-auto mb-5">
                <Users className="w-10 h-10 text-[var(--ds-primary)]/40" />
              </div>
              <p className="text-base font-bold text-[var(--text-secondary)]">Сотрудников не найдено</p>
              <p className="text-caption text-[var(--text-subtle)] mt-1.5 max-w-xs mx-auto">
                {search ? "Попробуйте изменить запрос поиска" : "Нажмите «+» чтобы добавить сотрудника"}
              </p>
            </motion.div>
          ) : (
            <div className="bg-[var(--ds-surface)] rounded-2xl border border-[var(--ds-border)] shadow-md overflow-x-auto">
              <div className="min-w-[720px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[var(--bg)] backdrop-blur-sm border-b border-[var(--ds-border)] z-10">
                    <tr>
                      <th className="px-4 py-3 text-left section-labelr w-10">#</th>
                      <th className="px-4 py-3 text-left section-labelr">Сотрудник</th>
                      <th className="px-4 py-3 text-left section-labelr">Роль</th>
                      <th className="px-4 py-3 text-left section-labelr hidden sm:table-cell">Телефон</th>
                      <th className="px-4 py-3 text-left section-labelr hidden md:table-cell">Email</th>
                      <th className="px-4 py-3 text-left section-labelr hidden lg:table-cell">Дата найма</th>
                      <th className="px-4 py-3 text-left section-labelr hidden lg:table-cell">Зарплата</th>
                      <th className="px-4 py-3 w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e3d9]">
                    {filtered.map((u, idx) => {
                      const isSelf = u.id === currentUser?.id;
                      const isInactive = u.isActive === false;
                      const RoleIcon = ROLE_ICONS[u.role] ?? Briefcase;

                      return (
                        <tr
                          key={u.id}
                          onClick={() => {
                            if (u.role !== "owner") {
                              navigate(`/users/${u.id}`);
                            }
                          }}
                          className={cn(
                            "bg-[var(--ds-surface)] hover:bg-[var(--bg)] transition-colors group",
                            u.role !== "owner" && "cursor-pointer",
                            isInactive && "opacity-50",
                          )}
                        >
                          {/* # */}
                          <td className="px-4 py-3.5 text-[var(--text-subtle)] text-caption font-mono">{idx + 1}</td>

                          {/* Name + avatar */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="relative shrink-0">
                                <div
                                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-caption shadow-sm"
                                  style={{
                                    background: "linear-gradient(135deg, #1f75fe 0%, #4d94ff 100%)",
                                  }}
                                >
                                  {initials(u.name)}
                                </div>
                                {!isInactive && (
                                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--success)] border-[1.5px] border-white" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-body font-semibold text-[var(--text)] truncate group-hover:text-[var(--ds-primary)] transition-colors">
                                    {u.name}
                                  </p>
                                  {isSelf && (
                                    <span className="text-micro bg-[var(--ds-primary)]/10 text-[var(--ds-primary)] font-bold px-1.5 py-0.5 rounded-md shrink-0">
                                      Вы
                                    </span>
                                  )}
                                  {isInactive && (
                                    <span className="text-micro bg-[var(--surface-2)] text-[var(--text-subtle)] font-semibold px-1.5 py-0.5 rounded-md shrink-0">
                                      Неактивен
                                    </span>
                                  )}
                                </div>
                                {(u.position || u.specialty) && (
                                  <p className="text-micro text-[var(--text-subtle)] truncate max-w-[180px]">
                                    {u.specialty || u.position}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Role */}
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 text-micro font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[var(--ds-primary)]/10 text-[var(--ds-primary)] border border-[var(--ds-primary)]/20 whitespace-nowrap">
                              <RoleIcon className="w-3 h-3" />
                              {t(`role.${u.role}`, ROLE_LABELS[u.role] ?? u.role)}
                            </span>
                          </td>

                          {/* Phone */}
                          <td className="px-4 py-3.5 hidden sm:table-cell">
                            {u.phone ? (
                              <span className="font-mono text-caption text-[var(--text-secondary)]">{u.phone}</span>
                            ) : (
                              <span className="text-[var(--text-subtle)] text-xs">—</span>
                            )}
                          </td>

                          {/* Email */}
                          <td className="px-4 py-3.5 hidden md:table-cell">
                            {u.email ? (
                              <span className="text-caption text-[var(--text-secondary)] truncate max-w-[160px] block">{u.email}</span>
                            ) : (
                              <span className="text-[var(--text-subtle)] text-xs">—</span>
                            )}
                          </td>

                          {/* Hire date */}
                          <td className="px-4 py-3.5 hidden lg:table-cell text-caption text-[var(--text-secondary)] whitespace-nowrap">
                            {u.hireDate ? (
                              <span>с {fmtHireDate(u.hireDate)}</span>
                            ) : (
                              <span className="text-[var(--text-subtle)]">—</span>
                            )}
                          </td>

                          {/* Salary */}
                          <td className="px-4 py-3.5 hidden lg:table-cell">
                            {u.salarySettings ? (
                              <span className="text-caption font-semibold text-[var(--ds-primary)] bg-[var(--ds-primary)]/10 px-2.5 py-1 rounded-lg inline-block">
                                {fmtSalaryShort(u)}
                              </span>
                            ) : (
                              <span className="text-[var(--text-subtle)] text-xs">—</span>
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
                              onNavigate={() => navigate(`/users/${u.id}`)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer with count */}
              <div className="bg-[var(--bg)] border-t border-[var(--ds-border)] px-5 py-2.5 text-caption text-[var(--text-subtle)]">
                Показано {filtered.length} из {rawUsers.length} сотрудников
              </div>
            </div>
          )}
        </div>

      {/* ── Dialogs (lazy — only load chunk when opened) ─────── */}
      {inviteOpen && (
        <Suspense fallback={null}>
          <InviteStaffDialog
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
          />
        </Suspense>
      )}

      {editDialogOpen && (
        <Suspense fallback={null}>
          <EmployeeDialog
            open={editDialogOpen}
            onClose={() => { setEditDialogOpen(false); setEditingUser(null); }}
            onSave={handleEditSave}
            isSaving={isSaving}
            editUser={editingUser}
          />
        </Suspense>
      )}

      <ConfirmDeleteDialog
        open={!!deleteConfirmId}
        onConfirm={() => { if (deleteConfirmId) deleteMutation.mutate({ id: deleteConfirmId }); }}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </PageShell>
  );
}

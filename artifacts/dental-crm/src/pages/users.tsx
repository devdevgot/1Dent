import { useState } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useListUsersAll,
  getListUsersAllQueryKey,
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUpdateUserStatus,
  useUpdateSalarySettings,
  usePatchUserCapacity,
} from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  UserPlus, Search, Phone, Calendar, Briefcase,
  ChevronRight, ChevronLeft, MoreVertical, UserCheck, UserX,
  Trash2, Users, SlidersHorizontal, Copy,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import EmployeeDialog, { type EmployeeFormData } from "./employee-dialog";
import { cn } from "@/lib/utils";

interface CreateUserApiResponse {
  user?: {
    id?: string;
    rawPassword?: string;
  };
}

const ROLES = ["admin", "doctor", "accountant", "warehouse"] as const;

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  owner:      { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  admin:      { bg: "bg-blue-100",   text: "text-blue-700",   border: "border-blue-200" },
  doctor:     { bg: "bg-emerald-100",text: "text-emerald-700",border: "border-emerald-200" },
  accountant: { bg: "bg-amber-100",  text: "text-amber-700",  border: "border-amber-200" },
  warehouse:  { bg: "bg-slate-100",  text: "text-slate-700",  border: "border-slate-200" },
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
  const type = s.salaryType;
  const fixed = Number(s.fixedAmount);
  const pct = Number(s.commissionPercent);
  if (type === "fixed") return `${fixed.toLocaleString("ru-KZ")} ₸`;
  if (type === "commission") return `${pct}%`;
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

export default function UsersPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuthStore();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
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

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListUsersAllQueryKey(showInactive) });

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: (res) => {
        invalidate();
        setDialogOpen(false);
        const rawPw = (res?.data as unknown as CreateUserApiResponse)?.user?.rawPassword;
        if (rawPw) {
          toast.success(t("employees.created", "Сотрудник создан"), {
            description: `${t("employees.password", "Пароль")}: ${rawPw}`,
            action: {
              label: t("employees.copy", "Копировать"),
              onClick: () => void navigator.clipboard.writeText(rawPw),
            },
            duration: 12000,
          });
        } else {
          toast.success(t("employees.created", "Сотрудник создан"));
        }
      },
      onError: (err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        const msg = status === 409 ? t("users.emailAlreadyInUse") : t("users.createError");
        toast.error(t("users.createErrorTitle"), { description: msg });
      },
    },
  });

  const updateMutation = useUpdateUser({
    mutation: {
      onSuccess: () => {
        invalidate();
        setDialogOpen(false);
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

  const isOwnerOrAdminForSalary = currentUser?.role === "owner" || currentUser?.role === "admin";

  const handleSave = async (formData: EmployeeFormData) => {
    if (editingUser) {
      await updateMutation.mutateAsync({
        id: editingUser.id,
        data: {
          name: formData.name,
          role: formData.role,
          phone: formData.phone || null,
          position: formData.position || null,
          specialty: formData.specialty || null,
          hireDate: formData.hireDate || null,
          password: formData.password || undefined,
        },
      });
      if (isOwnerOrAdminForSalary) {
        await updateSalaryMutation.mutateAsync({
          userId: editingUser.id,
          data: {
            salaryType: formData.salaryType,
            fixedAmount: formData.fixedAmount,
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
    } else {
      const res = await createMutation.mutateAsync({
        data: {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          phone: formData.phone || undefined,
          position: formData.position || undefined,
          specialty: formData.specialty || undefined,
          hireDate: formData.hireDate || undefined,
          maxPatientsPerDay: formData.maxPatientsPerDay,
        },
      });
      const newUserId = (res?.data as unknown as CreateUserApiResponse)?.user?.id;
      let partialFailure = false;
      if (newUserId && isOwnerOrAdminForSalary) {
        try {
          await updateSalaryMutation.mutateAsync({
            userId: newUserId,
            data: {
              salaryType: formData.salaryType,
              fixedAmount: formData.fixedAmount,
              commissionPercent: formData.commissionPercent,
            },
          });
        } catch {
          partialFailure = true;
        }
      }
      if (newUserId && formData.role === "doctor" && formData.maxPatientsPerDay > 0) {
        try {
          await capacityMutation.mutateAsync({
            id: newUserId,
            data: { maxPatientsPerDay: formData.maxPatientsPerDay },
          });
        } catch {
          partialFailure = true;
        }
      }
      if (partialFailure) {
        toast.warning(t("employees.partialSaveWarning", "Сотрудник создан, но настройки зарплаты / лимита не сохранились. Откройте профиль и сохраните снова."), { duration: 8000 });
      }
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isOwnerOrAdmin = isOwnerOrAdminForSalary;

  return (
    <div className="min-h-full bg-[#f7f8fc] pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.history.back()}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base font-bold text-gray-900">{t("users.title")}</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {filtered.length} {t("employees.people", "чел.")}
                {showInactive && ` (${t("employees.includingInactive", "включая неактивных")})`}
              </p>
            </div>
          </div>
          {isOwnerOrAdmin && (
            <button
              onClick={() => { setEditingUser(null); setDialogOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-white text-sm font-semibold"
              style={{ backgroundColor: "#98cc1c" }}
            >
              <UserPlus className="w-4 h-4" />
              {t("common.add", "Добавить")}
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("employees.searchPlaceholder", "Поиск...")}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {currentUser?.role === "owner" && (
            <button
              onClick={() => setShowInactive((v) => !v)}
              className={cn(
                "px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors",
                showInactive ? "bg-primary/10 border-primary/30 text-primary" : "bg-gray-50 border-gray-200 text-gray-500",
              )}
              title={t("employees.showInactive", "Показать неактивных")}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Role filter pills */}
        <div className="flex gap-1.5 mt-2.5 overflow-x-auto pb-0.5 scrollbar-none">
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
                {r === "all" ? t("employees.allRoles", "Все") : t(`role.${r}`, r)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Staff list */}
      <div className="px-4 pt-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-400">{t("users.emptyTitle")}</p>
            <p className="text-xs text-gray-300 mt-1">{t("users.emptyDesc")}</p>
          </div>
        ) : (
          <AnimatePresence>
            {filtered.map((u, i) => {
              const colors = ROLE_COLORS[u.role] ?? ROLE_COLORS["warehouse"];
              const avatarColor = AVATAR_COLORS[u.role] ?? "#6b7280";
              const isSelf = u.id === currentUser?.id;
              const isInactive = u.isActive === false;

              return (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={cn(
                    "bg-white rounded-2xl border border-gray-100 shadow-sm p-4",
                    isInactive && "opacity-60",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                      style={{ backgroundColor: avatarColor }}
                    >
                      {initials(u.name)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-bold text-gray-900 truncate">{u.name}</p>
                            {isSelf && (
                              <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full">
                                {t("users.you")}
                              </span>
                            )}
                            {isInactive && (
                              <span className="text-[10px] bg-gray-100 text-gray-500 font-bold px-1.5 py-0.5 rounded-full">
                                {t("employees.inactive", "Неактивен")}
                              </span>
                            )}
                          </div>
                          <span className={cn(
                            "inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border",
                            colors.bg, colors.text, colors.border,
                          )}>
                            {t(`role.${u.role}`)}
                          </span>
                        </div>

                        <UserActionMenu
                          user={u}
                          currentUserId={currentUser?.id ?? ""}
                          currentRole={currentUser?.role ?? ""}
                          onEdit={() => { setEditingUser(u); setDialogOpen(true); }}
                          onDelete={() => setDeleteConfirmId(u.id)}
                          onToggleActive={() => statusMutation.mutate({ id: u.id, isActive: !u.isActive })}
                          onNavigate={() => navigate(`/staff/${u.id}`)}
                        />
                      </div>

                      <div className="mt-2 space-y-1">
                        {u.position && (
                          <div className="flex items-center gap-1.5">
                            <Briefcase className="w-3 h-3 text-gray-300 shrink-0" />
                            <span className="text-xs text-gray-500">{u.position}</span>
                            {u.specialty && <span className="text-xs text-gray-400">· {u.specialty}</span>}
                          </div>
                        )}
                        {u.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-gray-300 shrink-0" />
                            <span className="text-xs text-gray-500">{u.phone}</span>
                          </div>
                        )}
                        {u.hireDate && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-gray-300 shrink-0" />
                            <span className="text-xs text-gray-400">
                              {t("employees.since", "с")} {fmtHireDate(u.hireDate)}
                            </span>
                          </div>
                        )}
                        {u.salarySettings && (
                          <div className="mt-1 inline-block bg-gray-50 rounded-lg px-2.5 py-1">
                            <span className="text-[11px] font-semibold text-gray-600">
                              {fmtSalaryShort(u)}
                            </span>
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
      </div>

      <EmployeeDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingUser(null); }}
        onSave={handleSave}
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

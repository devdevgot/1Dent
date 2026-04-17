import { useState } from "react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  useListUsers,
  useCreateUser,
  useDeleteUser,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  UserPlus, Trash2, RefreshCw, Shield, User2,
  Mail, Lock, ChevronDown, ChevronLeft, Users,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

const ROLES = ["admin", "doctor", "accountant", "warehouse"] as const;
type Role = (typeof ROLES)[number];

function RoleBadge({ role }: { role: string }) {
  const { t } = useTranslation();
  const colors: Record<string, string> = {
    owner:      "bg-purple-100 text-purple-700",
    admin:      "bg-blue-100 text-blue-700",
    doctor:     "bg-emerald-100 text-emerald-700",
    accountant: "bg-amber-100 text-amber-700",
    warehouse:  "bg-slate-100 text-slate-700",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${colors[role] ?? "bg-slate-100 text-slate-700"}`}>
      {t(`role.${role}`)}
    </span>
  );
}

export default function UsersPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", password: "", role: "doctor" as Role });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useListUsers({
    query: { queryKey: getListUsersQueryKey() },
  });

  const users = data?.data?.users ?? [];

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setShowForm(false);
        setFormData({ name: "", email: "", password: "", role: "doctor" });
        toast({ title: t("users.createSuccess"), description: t("users.createSuccessDesc") });
      },
      onError: (err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        let msg: string;
        if (status === 409) {
          msg = t("users.emailAlreadyInUse");
        } else if (status === 403) {
          msg = t("users.forbiddenError");
        } else {
          msg = t("users.createError");
        }
        toast({ title: t("users.createErrorTitle"), description: msg, variant: "destructive" });
      },
    },
  });

  const deleteMutation = useDeleteUser({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setDeleteConfirmId(null);
        toast({ title: t("users.deleteSuccess") });
      },
      onError: () => {
        toast({ title: t("users.deleteError"), variant: "destructive" });
      },
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.password.trim()) return;
    createMutation.mutate({ data: formData });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ id });
  };

  const canDelete = currentUser?.role === "owner";

  return (
    <div className="min-h-full bg-[#f2f2f7]">
      <div className="bg-white px-4 pt-5 pb-4 flex items-center gap-3 border-b border-gray-100">
        <button
          onClick={() => window.history.back()}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-gray-500 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
            <h1 className="text-[17px] font-semibold text-gray-900">{t("users.title")}</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{t("users.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => refetch()}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="px-3 py-1.5 bg-primary text-white text-sm font-semibold rounded-xl flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            {t("users.addStaff")}
          </button>
        </div>
      </div>
      <div className="space-y-4 p-4 pb-8">

      {/* Add Staff Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form
              onSubmit={handleCreate}
              className="bg-card rounded-2xl border border-primary/20 p-6 shadow-sm space-y-4"
            >
              <h3 className="text-lg font-bold font-display flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                {t("users.formTitle")}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1.5">
                    {t("users.name")}
                  </label>
                  <div className="relative">
                    <User2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={t("users.namePlaceholder")}
                      required
                      className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1.5">
                    {t("users.email")}
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder={t("users.emailPlaceholder")}
                      required
                      className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1.5">
                    {t("users.password")}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={t("users.passwordPlaceholder")}
                      required
                      minLength={6}
                      className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>

                {/* Role */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1.5">
                    {t("users.role")}
                  </label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                      className="w-full pl-9 pr-8 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none bg-background"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`role.${r}`)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground hover:bg-slate-50 transition-colors"
                >
                  {t("users.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-60 hover:-translate-y-0.5 transition-all shadow-lg shadow-primary/20"
                >
                  {createMutation.isPending ? t("users.creating") : t("users.create")}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Users List */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-slate-200 flex-none" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-32 mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-48" />
                </div>
                <div className="w-20 h-6 bg-slate-200 rounded-full" />
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-muted-foreground mb-4">
              <User2 className="w-8 h-8 opacity-50" />
            </div>
            <h3 className="text-xl font-bold font-display">{t("users.emptyTitle")}</h3>
            <p className="text-muted-foreground max-w-sm mt-2">{t("users.emptyDesc")}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {users.map((u, i) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-4 p-5 hover:bg-slate-50 transition-colors"
              >
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg flex-none">
                  {u.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground">{u.name}</p>
                    {u.id === currentUser?.id && (
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wide bg-primary/10 px-2 py-0.5 rounded-full">
                        {t("users.you")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                </div>

                {/* Role */}
                <RoleBadge role={u.role} />

                {/* Delete */}
                {canDelete && u.id !== currentUser?.id && u.role !== "owner" && (
                  <div className="flex-none">
                    <button
                      onClick={() => setDeleteConfirmId(u.id)}
                      className="w-9 h-9 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground text-center px-4">
        {t("users.registrationNote")}
      </p>
      <ConfirmDeleteDialog
        open={!!deleteConfirmId}
        onConfirm={() => { handleDelete(deleteConfirmId!); setDeleteConfirmId(null); }}
        onCancel={() => setDeleteConfirmId(null)}
      />
      </div>
    </div>
  );
}

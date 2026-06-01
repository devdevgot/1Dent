import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { haptic } from "../hooks/useTgBackButton";

interface PlatformAdmin {
  id: string;
  telegramId: string;
  name?: string | null;
  telegramUsername?: string | null;
  role: string;
  createdAt: string;
}

interface PlatformSettings {
  admins: PlatformAdmin[];
  stats: { clinics: number; users: number; patients: number };
  bot: { configured: boolean; webhookUrl: string | null; tmaUrl: string | null };
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card rounded-lg border border-border p-3 text-center">
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function AdminRow({ admin, onRemove }: { admin: PlatformAdmin; onRemove: (id: string) => void }) {
  return (
    <div className="bg-card rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
            {(admin.name ?? admin.telegramId)[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{admin.name ?? `TG ${admin.telegramId}`}</p>
            <div className="flex items-center gap-1 flex-wrap">
              {admin.telegramUsername && <span className="text-xs text-muted-foreground">@{admin.telegramUsername}</span>}
              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{admin.role}</span>
            </div>
          </div>
        </div>
        <button
          onClick={() => { haptic("medium"); onRemove(admin.id); }}
          className="text-xs text-destructive px-2 py-1 bg-destructive/10 rounded-lg flex-shrink-0 hover:bg-destructive/20 transition-colors"
        >
          Удалить
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [tgId, setTgId] = useState("");
  const [tgName, setTgName] = useState("");
  const [role, setRole] = useState("superadmin");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tma-settings"],
    queryFn: () => api.get<{ success: boolean; data: PlatformSettings }>("/settings"),
    staleTime: 30_000,
  });

  const settings = data?.data;

  const addAdmin = useMutation({
    mutationFn: () => api.post("/admins", { telegramId: tgId.trim(), name: tgName.trim() || undefined, role }),
    onSuccess: () => {
      haptic("success");
      setTgId(""); setTgName(""); setShowAddForm(false);
      void qc.invalidateQueries({ queryKey: ["tma-settings"] });
      void qc.invalidateQueries({ queryKey: ["tma-admins"] });
    },
  });

  const removeAdmin = useMutation({
    mutationFn: (id: string) => api.delete(`/admins/${id}`),
    onSuccess: () => {
      haptic("medium");
      void qc.invalidateQueries({ queryKey: ["tma-settings"] });
      void qc.invalidateQueries({ queryKey: ["tma-admins"] });
    },
  });

  const admins = settings?.admins ?? [];

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Настройки платформы</h1>
        <p className="text-sm text-muted-foreground">Администраторы, бот, интеграции</p>
      </div>

      {/* Platform stats */}
      {settings && (
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Клиник" value={settings.stats.clinics} />
          <StatCard label="Польз." value={settings.stats.users} />
          <StatCard label="Пациентов" value={settings.stats.patients} />
        </div>
      )}

      {/* Bot info */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">🤖 Платформенный бот</h2>
        {isLoading ? (
          <div className="h-20 bg-card rounded-lg border border-border animate-pulse" />
        ) : (
          <div className="bg-card rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${settings?.bot.configured ? "bg-green-400" : "bg-red-400"}`} />
              <span className="text-sm text-foreground">{settings?.bot.configured ? "Токен настроен" : "Токен не настроен"}</span>
            </div>
            {settings?.bot.webhookUrl && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Webhook URL</p>
                <p className="text-xs font-mono text-foreground bg-muted/50 rounded px-2 py-1.5 break-all">{settings.bot.webhookUrl}</p>
              </div>
            )}
            {settings?.bot.tmaUrl && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">TMA URL</p>
                <p className="text-xs font-mono text-foreground bg-muted/50 rounded px-2 py-1.5 break-all">{settings.bot.tmaUrl}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admins */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">👥 Администраторы ({admins.length})</h2>
          <button
            onClick={() => { haptic("light"); setShowAddForm((v) => !v); }}
            className="text-xs text-primary px-3 py-1.5 bg-primary/10 rounded-lg font-medium"
          >
            {showAddForm ? "Отмена" : "+ Добавить"}
          </button>
        </div>

        {showAddForm && (
          <div className="bg-card border border-border rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Новый администратор</p>
            <input
              value={tgId}
              onChange={(e) => setTgId(e.target.value)}
              placeholder="Telegram ID (числовой)*"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            />
            <input
              value={tgName}
              onChange={(e) => setTgName(e.target.value)}
              placeholder="Имя (необязательно)"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
            >
              <option value="superadmin">superadmin</option>
              <option value="support">support</option>
            </select>
            <button
              onClick={() => { haptic("light"); addAdmin.mutate(); }}
              disabled={!tgId.trim() || addAdmin.isPending}
              className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {addAdmin.isPending ? "Добавление..." : "Добавить"}
            </button>
            {addAdmin.isError && <p className="text-xs text-destructive">{(addAdmin.error as Error).message}</p>}
          </div>
        )}

        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-card rounded-lg border border-border animate-pulse" />)
        ) : admins.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-4">Нет администраторов</p>
        ) : (
          <div className="space-y-2">
            {admins.map((a) => (
              <AdminRow key={a.id} admin={a} onRemove={(id) => removeAdmin.mutate(id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

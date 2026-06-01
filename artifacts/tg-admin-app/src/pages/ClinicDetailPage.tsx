import React, { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import WebApp from "@twa-dev/sdk";
import { api, type ChatbotSession, type ChatbotMessage, type Notification, type Broadcast, type ClinicFile, type Contract, type KnowledgeEntry } from "../lib/api";
import { haptic, hapticNotify, tgConfirm, tgAlert } from "../hooks/useTgBackButton";

type Tab =
  | "info" | "users" | "patients" | "chatbot" | "sessions" | "messages"
  | "channels" | "procedures" | "analytics" | "broadcasts"
  | "knowledge" | "contracts" | "finances" | "logs" | "notifications" | "files";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "info", label: "Инфо", icon: "ℹ️" },
  { id: "users", label: "Персонал", icon: "👥" },
  { id: "patients", label: "Пациенты", icon: "🦷" },
  { id: "chatbot", label: "Чат-бот", icon: "🤖" },
  { id: "sessions", label: "Сессии", icon: "💬" },
  { id: "messages", label: "Сообщения", icon: "📨" },
  { id: "channels", label: "Каналы", icon: "📡" },
  { id: "procedures", label: "Услуги", icon: "💊" },
  { id: "analytics", label: "Аналитика", icon: "📊" },
  { id: "broadcasts", label: "Рассылки", icon: "📢" },
  { id: "knowledge", label: "База знаний", icon: "📚" },
  { id: "contracts", label: "Договоры", icon: "📝" },
  { id: "finances", label: "Финансы", icon: "💰" },
  { id: "logs", label: "Логи", icon: "📋" },
  { id: "notifications", label: "Уведомления", icon: "🔔" },
  { id: "files", label: "Файлы", icon: "📁" },
];

const planColors: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  starter: "bg-blue-500/20 text-blue-400",
  professional: "bg-purple-500/20 text-purple-400",
  enterprise: "bg-amber-500/20 text-amber-400",
};

function EmptyState({ icon = "📭", text = "Нет данных" }: { icon?: string; text?: string }) {
  return (
    <div className="py-12 text-center text-muted-foreground">
      <p className="text-3xl mb-2">{icon}</p>
      <p className="text-sm">{text}</p>
    </div>
  );
}
function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-20 bg-card rounded-lg border border-border animate-pulse" />
      ))}
    </div>
  );
}
function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground mt-1">{String(value ?? "—")}</p>
    </div>
  );
}
function Paginator({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex justify-center gap-2 pt-2">
      <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40">←</button>
      <span className="text-sm text-muted-foreground self-center">{page}/{pages}</span>
      <button onClick={() => onPage(Math.min(pages, page + 1))} disabled={page === pages} className="px-3 py-1.5 bg-card border border-border rounded-lg text-sm disabled:opacity-40">→</button>
    </div>
  );
}

// ── Info Tab ──
function InfoTab({ clinicId }: { clinicId: string }) {
  const qc = useQueryClient();
  const [editPlan, setEditPlan] = useState(false);
  const [plan, setPlan] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-detail", clinicId],
    queryFn: () => api.get<{ success: boolean; data: { clinic: Record<string, unknown> } }>(`/clinics/${clinicId}`),
  });
  const c = data?.data?.clinic;

  const updateMut = useMutation({
    mutationFn: (p: string) => api.patch(`/clinics/${clinicId}`, { plan: p }),
    onSuccess: () => { hapticNotify("success"); qc.invalidateQueries({ queryKey: ["tma-clinic-detail", clinicId] }); setEditPlan(false); tgAlert("Тариф обновлён"); },
    onError: (err) => { hapticNotify("error"); tgAlert(err instanceof Error ? err.message : "Ошибка"); },
  });

  const deactivateMut = useMutation({
    mutationFn: () => api.delete(`/clinics/${clinicId}`),
    onSuccess: () => { hapticNotify("warning"); qc.invalidateQueries({ queryKey: ["tma-clinics"] }); tgAlert("Клиника деактивирована"); },
  });

  const reactivateMut = useMutation({
    mutationFn: () => api.patch(`/clinics/${clinicId}`, { isActive: true }),
    onSuccess: () => { hapticNotify("success"); qc.invalidateQueries({ queryKey: ["tma-clinic-detail", clinicId] }); },
  });

  if (isLoading) return <LoadingSkeleton rows={2} />;
  if (!c) return <EmptyState />;

  const cp = String(c["plan"] ?? "free");
  const isActive = c["isActive"] !== false;

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold text-xl">
            {String(c["name"] ?? "?")[0]?.toUpperCase()}
          </div>
          <div>
            <h3 className="font-bold text-foreground">{String(c["name"] ?? "—")}</h3>
            <p className="text-xs text-muted-foreground font-mono">ID: {clinicId.slice(0, 16)}…</p>
          </div>
          <div className="ml-auto">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${isActive ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
              {isActive ? "Активна" : "Неактивна"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Сотрудники" value={String(c["usersCount"] ?? 0)} />
          <StatCard label="Пациенты" value={String(c["patientsCount"] ?? 0)} />
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1">Создана</p>
          <p className="text-sm text-foreground">{new Date(String(c["createdAt"] ?? "")).toLocaleDateString("ru", { dateStyle: "long" })}</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">Тариф</p>
            <button onClick={() => { haptic("light"); setPlan(cp); setEditPlan(!editPlan); }} className="text-xs text-primary">
              {editPlan ? "Отмена" : "Изменить"}
            </button>
          </div>
          {editPlan ? (
            <div className="flex gap-2">
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-sm text-foreground">
                <option value="free">Free</option>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <button onClick={() => { haptic("medium"); updateMut.mutate(plan); }} disabled={updateMut.isPending} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">✓</button>
            </div>
          ) : (
            <span className={`inline-block text-xs px-2 py-1 rounded-lg font-medium ${planColors[cp] ?? ""}`}>{cp}</span>
          )}
        </div>

        <div className="pt-2 border-t border-border">
          {isActive ? (
            <button
              onClick={() => {
                haptic("heavy");
                tgConfirm(`Деактивировать клинику "${String(c["name"])}"? Клиника будет скрыта из списка, данные сохранятся.`, (ok) => {
                  if (ok) deactivateMut.mutate();
                });
              }}
              disabled={deactivateMut.isPending}
              className="w-full py-2 border border-red-500/30 text-red-400 rounded-lg text-sm hover:bg-red-500/10 disabled:opacity-50"
            >Деактивировать клинику</button>
          ) : (
            <button
              onClick={() => { haptic("medium"); reactivateMut.mutate(); }}
              disabled={reactivateMut.isPending}
              className="w-full py-2 border border-green-500/30 text-green-400 rounded-lg text-sm hover:bg-green-500/10 disabled:opacity-50"
            >Активировать клинику</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Users Tab ──
function UsersTab({ clinicId }: { clinicId: string }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "doctor", specialty: "", phone: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-users", clinicId],
    queryFn: () => api.get<{ success: boolean; data: { users: Record<string, unknown>[] } }>(`/clinics/${clinicId}/users`),
  });
  const toggleMut = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      api.patch(`/clinics/${clinicId}/users/${userId}`, { isActive }),
    onSuccess: () => { hapticNotify("success"); qc.invalidateQueries({ queryKey: ["tma-clinic-users", clinicId] }); },
  });
  const deleteMut = useMutation({
    mutationFn: (userId: string) => api.delete(`/clinics/${clinicId}/users/${userId}`),
    onSuccess: () => { hapticNotify("warning"); qc.invalidateQueries({ queryKey: ["tma-clinic-users", clinicId] }); },
  });
  const createMut = useMutation({
    mutationFn: () => api.post(`/clinics/${clinicId}/users`, { ...form, password: "changeme123" }),
    onSuccess: () => {
      hapticNotify("success");
      qc.invalidateQueries({ queryKey: ["tma-clinic-users", clinicId] });
      setShowAdd(false);
      setForm({ name: "", email: "", role: "doctor", specialty: "", phone: "" });
    },
    onError: (err) => tgAlert(err instanceof Error ? err.message : "Ошибка"),
  });

  if (isLoading) return <LoadingSkeleton />;
  const users = data?.data?.users ?? [];
  return (
    <div className="space-y-3">
      <button onClick={() => { haptic("light"); setShowAdd(v => !v); }}
        className="w-full py-2 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary font-medium">
        {showAdd ? "✕ Отмена" : "+ Добавить сотрудника"}
      </button>

      {showAdd && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">Новый сотрудник</p>
          {(["name", "email", "phone"] as const).map((f) => (
            <input key={f} value={form[f]} onChange={(e) => setForm(p => ({ ...p, [f]: e.target.value }))}
              placeholder={f === "name" ? "Имя*" : f === "email" ? "Email*" : "Телефон"}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
          ))}
          <div className="flex gap-2">
            <select value={form.role} onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))}
              className="flex-1 bg-background border border-border rounded-lg px-2 py-2 text-sm text-foreground">
              {["owner","admin","doctor","accountant","warehouse"].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {form.role === "doctor" && (
              <input value={form.specialty} onChange={(e) => setForm(p => ({ ...p, specialty: e.target.value }))}
                placeholder="Специальность" className="flex-1 bg-background border border-border rounded-lg px-2 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
            )}
          </div>
          <button onClick={() => { if (form.name && form.email) { haptic("medium"); createMut.mutate(); } }}
            disabled={!form.name.trim() || !form.email.trim() || createMut.isPending}
            className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50">
            {createMut.isPending ? "Сохранение..." : "Создать"}
          </button>
        </div>
      )}

      {!users.length && !showAdd && <EmptyState icon="👥" text="Нет сотрудников" />}
      <div className="space-y-2">
        {users.map((u, i) => (
          <div key={i} className="bg-card rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">{String(u["name"] ?? "—")}</p>
                  <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{String(u["role"] ?? "")}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${u["isActive"] ? "text-green-400" : "text-muted-foreground"}`}>
                    {u["isActive"] ? "●" : "○"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{String(u["email"] ?? "—")}{u["specialty"] ? ` · ${String(u["specialty"])}` : ""}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => { haptic("medium"); toggleMut.mutate({ userId: String(u["id"]), isActive: !u["isActive"] }); }}
                  className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:border-primary/50">
                  {u["isActive"] ? "↓" : "↑"}
                </button>
                <button onClick={() => { haptic("heavy"); tgConfirm(`Деактивировать ${String(u["name"])}?`, (ok) => { if (ok) deleteMut.mutate(String(u["id"])); }); }}
                  className="text-xs px-2 py-1 rounded-lg border border-red-500/20 text-red-400">✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PATIENT_STATUSES = [
  { value: "", label: "Все статусы" },
  { value: "new_request", label: "Новая заявка" },
  { value: "initial_consultation", label: "Консультация" },
  { value: "diagnostics", label: "Диагностика" },
  { value: "treatment_assigned", label: "Назначено лечение" },
  { value: "treatment_in_progress", label: "Лечение" },
  { value: "post_op_monitoring", label: "Мониторинг" },
  { value: "completed", label: "Завершён" },
];

const statusColors: Record<string, string> = {
  new_request: "bg-blue-500/20 text-blue-400",
  initial_consultation: "bg-cyan-500/20 text-cyan-400",
  diagnostics: "bg-yellow-500/20 text-yellow-400",
  treatment_assigned: "bg-orange-500/20 text-orange-400",
  treatment_in_progress: "bg-purple-500/20 text-purple-400",
  post_op_monitoring: "bg-pink-500/20 text-pink-400",
  completed: "bg-green-500/20 text-green-400",
};

// ── Patients Tab ──
function PatientsTab({ clinicId }: { clinicId: string }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");

  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set("search", search);
  if (status) params.set("status", status);

  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-patients", clinicId, page, search, status],
    queryFn: () => api.get<{ success: boolean; data: { patients: Record<string, unknown>[]; total: number } }>(`/clinics/${clinicId}/patients?${params}`),
  });
  const patchMut = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => api.patch(`/clinics/${clinicId}/patients/${id}`, { status: s }),
    onSuccess: () => { hapticNotify("success"); setEditingId(null); qc.invalidateQueries({ queryKey: ["tma-clinic-patients", clinicId] }); },
  });

  const patients = data?.data?.patients ?? [];
  const total = data?.data?.total ?? 0;
  const pages = Math.ceil(total / 50);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="🔍 Поиск..."
          className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="flex-1 bg-card border border-border rounded-lg px-2 py-2 text-sm text-foreground">
          {PATIENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      {isLoading ? <LoadingSkeleton /> : (
        <>
          <p className="text-xs text-muted-foreground">Всего: {total}</p>
          {!patients.length ? <EmptyState icon="🦷" text="Нет пациентов" /> : (
            <div className="space-y-2">
              {patients.map((p, i) => (
                <div key={i} className="bg-card rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{String(p["name"] ?? "—")}</p>
                      <p className="text-xs text-muted-foreground">{String(p["phone"] ?? "—")} · {String(p["source"] ?? "—")}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${statusColors[String(p["status"])] ?? "bg-muted text-muted-foreground"}`}>
                      {PATIENT_STATUSES.find(s => s.value === p["status"])?.label ?? String(p["status"])}
                    </span>
                  </div>
                  {editingId === String(p["id"]) ? (
                    <div className="flex gap-2">
                      <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                        className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-sm text-foreground">
                        {PATIENT_STATUSES.filter(s => s.value).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <button onClick={() => { haptic("medium"); patchMut.mutate({ id: String(p["id"]), s: editStatus }); }}
                        disabled={patchMut.isPending} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">✓</button>
                      <button onClick={() => setEditingId(null)} className="px-3 py-1.5 bg-muted text-muted-foreground rounded-lg text-sm">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => { haptic("light"); setEditingId(String(p["id"])); setEditStatus(String(p["status"])); }}
                      className="text-xs text-primary px-2 py-1 bg-primary/10 rounded-lg">Изменить статус</button>
                  )}
                </div>
              ))}
            </div>
          )}
          <Paginator page={page} pages={pages} onPage={setPage} />
        </>
      )}
    </div>
  );
}

// ── Chatbot Overview + Settings ──
function ChatbotTab({ clinicId }: { clinicId: string }) {
  const qc = useQueryClient();
  const [subTab, setSubTab] = useState<"overview" | "settings">("overview");
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    enabled: true,
    greetingTemplate: "",
    greenApiInstanceId: "",
    greenApiToken: "",
    greenApiUrl: "",
    telegramBotToken: "",
    whatsappPhone: "",
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const overviewQ = useQuery({
    queryKey: ["tma-clinic-chatbot", clinicId],
    queryFn: () => api.get<{ success: boolean; data: { totalSessions: number; totalMessages: number; recentSessions: ChatbotSession[] } }>(`/clinics/${clinicId}/chatbot`),
    enabled: subTab === "overview",
  });
  const settingsQ = useQuery({
    queryKey: ["tma-clinic-chatbot-settings", clinicId],
    queryFn: () => api.get<{ success: boolean; data: { settings: Record<string, unknown> | null; connection: Record<string, unknown> | null } }>(`/clinics/${clinicId}/chatbot/settings`),
    enabled: subTab === "settings",
  });

  useEffect(() => {
    if (settingsQ.data?.data && !settingsLoaded) {
      const s = settingsQ.data.data.settings;
      const c = settingsQ.data.data.connection;
      setSettingsForm({
        enabled: Boolean(s?.["enabled"] ?? true),
        greetingTemplate: String(s?.["greetingTemplate"] ?? ""),
        greenApiInstanceId: String(c?.["greenApiInstanceId"] ?? ""),
        greenApiToken: String(c?.["greenApiToken"] ?? ""),
        greenApiUrl: String(c?.["greenApiUrl"] ?? ""),
        telegramBotToken: String(c?.["telegramBotToken"] ?? ""),
        whatsappPhone: String(c?.["whatsappPhone"] ?? ""),
      });
      setSettingsLoaded(true);
    }
  }, [settingsQ.data, settingsLoaded]);

  const saveMut = useMutation({
    mutationFn: () => api.patch(`/clinics/${clinicId}/chatbot/settings`, settingsForm),
    onSuccess: () => { hapticNotify("success"); qc.invalidateQueries({ queryKey: ["tma-clinic-chatbot-settings", clinicId] }); tgAlert("Настройки сохранены"); },
    onError: (err) => { hapticNotify("error"); tgAlert(err instanceof Error ? err.message : "Ошибка"); },
  });

  const handlePing = async () => {
    haptic("light");
    setPingStatus("Проверяю...");
    try {
      const res = await api.post<{ success: boolean; data: { connected: boolean; stateInstance?: string; reason?: string } }>(`/clinics/${clinicId}/chatbot/ping`);
      setPingStatus(res.data.connected ? `✅ Подключён (${res.data.stateInstance ?? ""})` : `❌ Не подключён${res.data.reason ? ` — ${res.data.reason}` : ""}`);
    } catch {
      setPingStatus("❌ Ошибка проверки");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["overview", "settings"] as const).map((t) => (
          <button key={t} onClick={() => { haptic("light"); setSubTab(t); setSettingsLoaded(false); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${subTab === t ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"}`}>
            {t === "overview" ? "📊 Обзор" : "⚙️ Настройки"}
          </button>
        ))}
      </div>

      {subTab === "overview" && (
        overviewQ.isLoading ? <LoadingSkeleton rows={2} /> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Сессий" value={overviewQ.data?.data?.totalSessions ?? 0} />
              <StatCard label="Сообщений" value={overviewQ.data?.data?.totalMessages ?? 0} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Последние сессии</p>
              <div className="space-y-2">
                {(overviewQ.data?.data?.recentSessions ?? []).map((s) => (
                  <div key={s.id} className="bg-card rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{s.phone}</span>
                      {s.humanTakeover && <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">👤 Оператор</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{s.state} · {new Date(s.updatedAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}</p>
                  </div>
                ))}
                {!(overviewQ.data?.data?.recentSessions ?? []).length && <EmptyState icon="🤖" text="Нет активных сессий" />}
              </div>
            </div>
          </div>
        )
      )}

      {subTab === "settings" && (
        settingsQ.isLoading ? <LoadingSkeleton rows={3} /> : (
          <div className="space-y-3">
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">🤖 Бот</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Чат-бот активен</span>
                <button onClick={() => setSettingsForm(p => ({ ...p, enabled: !p.enabled }))}
                  className={`w-12 h-6 rounded-full transition-colors ${settingsForm.enabled ? "bg-primary" : "bg-muted"}`}>
                  <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${settingsForm.enabled ? "translate-x-6" : "translate-x-0"}`} />
                </button>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Приветствие</p>
                <textarea value={settingsForm.greetingTemplate} onChange={(e) => setSettingsForm(p => ({ ...p, greetingTemplate: e.target.value }))} rows={3}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary resize-none" />
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">📱 WhatsApp (Green API)</p>
                <button onClick={handlePing} className="text-xs text-primary px-2 py-1 bg-primary/10 rounded-lg">Ping</button>
              </div>
              {pingStatus && <p className="text-xs text-foreground bg-muted/50 px-3 py-2 rounded-lg">{pingStatus}</p>}
              {[
                { key: "greenApiInstanceId", label: "idInstance" },
                { key: "greenApiToken", label: "apiToken" },
                { key: "greenApiUrl", label: "apiUrl" },
                { key: "whatsappPhone", label: "Телефон WhatsApp" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                  <input value={settingsForm[key as keyof typeof settingsForm] as string}
                    onChange={(e) => setSettingsForm(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={label} type={key.toLowerCase().includes("token") ? "password" : "text"}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary font-mono" />
                </div>
              ))}
            </div>

            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">✈️ Telegram</p>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Bot Token</p>
                <input value={settingsForm.telegramBotToken} onChange={(e) => setSettingsForm(p => ({ ...p, telegramBotToken: e.target.value }))}
                  placeholder="123456789:AABBcc..." type="password"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary font-mono" />
              </div>
            </div>

            <button onClick={() => { haptic("medium"); saveMut.mutate(); }} disabled={saveMut.isPending}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium text-sm disabled:opacity-50">
              {saveMut.isPending ? "Сохранение..." : "💾 Сохранить настройки"}
            </button>
          </div>
        )
      )}
    </div>
  );
}

// ── Sessions Tab with actions ──
function SessionsTab({ clinicId }: { clinicId: string }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-sessions", clinicId, page],
    queryFn: () => api.get<{ success: boolean; data: { sessions: ChatbotSession[]; total: number } }>(`/clinics/${clinicId}/sessions?page=${page}`),
  });
  const takeoverMut = useMutation({
    mutationFn: ({ id, val }: { id: string; val: boolean }) => api.post(`/clinics/${clinicId}/sessions/${id}/takeover`, { humanTakeover: val }),
    onSuccess: () => { hapticNotify("success"); qc.invalidateQueries({ queryKey: ["tma-clinic-sessions", clinicId] }); },
  });
  const resetMut = useMutation({
    mutationFn: (id: string) => api.post(`/clinics/${clinicId}/sessions/${id}/reset`),
    onSuccess: () => { hapticNotify("success"); qc.invalidateQueries({ queryKey: ["tma-clinic-sessions", clinicId] }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/clinics/${clinicId}/sessions/${id}`),
    onSuccess: () => { hapticNotify("warning"); qc.invalidateQueries({ queryKey: ["tma-clinic-sessions", clinicId] }); },
  });

  if (isLoading) return <LoadingSkeleton />;
  const sessions = data?.data?.sessions ?? [];
  const total = data?.data?.total ?? 0;
  const pages = Math.ceil(total / 50);
  if (!sessions.length) return <EmptyState icon="💬" text="Нет сессий" />;

  const stateColors: Record<string, string> = {
    greeting: "bg-blue-500/20 text-blue-400",
    collecting_name: "bg-yellow-500/20 text-yellow-400",
    booking: "bg-green-500/20 text-green-400",
    human_takeover: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Всего: {total}</p>
      {sessions.map((s) => (
        <div key={s.id} className="bg-card rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">{s.phone}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${stateColors[s.state] ?? "bg-muted text-muted-foreground"}`}>{s.state}</span>
          </div>
          <p className="text-xs text-muted-foreground">{new Date(s.updatedAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}</p>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => { haptic("medium"); takeoverMut.mutate({ id: s.id, val: !s.humanTakeover }); }}
              disabled={takeoverMut.isPending}
              className={`text-xs px-2 py-1 rounded-lg border transition-colors ${s.humanTakeover ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-card border-border text-muted-foreground hover:border-primary/50"}`}
            >{s.humanTakeover ? "👤 Снять" : "👤 Передать"}</button>
            <button onClick={() => { haptic("light"); resetMut.mutate(s.id); }} disabled={resetMut.isPending} className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:border-primary/50">🔄 Сброс</button>
            <button
              onClick={() => {
                haptic("heavy");
                tgConfirm("Удалить сессию?", (ok) => { if (ok) deleteMut.mutate(s.id); });
              }}
              disabled={deleteMut.isPending}
              className="text-xs px-2 py-1 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10"
            >Удалить</button>
          </div>
        </div>
      ))}
      <Paginator page={page} pages={pages} onPage={setPage} />
    </div>
  );
}

// ── Messages Tab ──
function MessagesTab({ clinicId }: { clinicId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-messages", clinicId, page],
    queryFn: () => api.get<{ success: boolean; data: { messages: ChatbotMessage[]; total: number } }>(`/clinics/${clinicId}/messages?page=${page}`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const messages = data?.data?.messages ?? [];
  const total = data?.data?.total ?? 0;
  const pages = Math.ceil(total / 50);
  if (!messages.length) return <EmptyState icon="📨" text="Нет сообщений" />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Всего: {total}</p>
      {messages.map((m) => (
        <div key={m.id} className={`flex gap-2 ${m.direction === "inbound" ? "flex-row" : "flex-row-reverse"}`}>
          <div className={`max-w-[80%] rounded-xl px-3 py-2 ${m.direction === "inbound" ? "bg-card border border-border" : "bg-primary/20 border border-primary/30"}`}>
            <p className="text-xs font-medium text-muted-foreground mb-0.5">{m.direction === "inbound" ? "📱 " + m.phone.slice(-4) : "🤖 Бот"}</p>
            <p className="text-sm text-foreground">{m.content}</p>
            <p className="text-xs text-muted-foreground mt-1">{new Date(m.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>
      ))}
      <Paginator page={page} pages={pages} onPage={setPage} />
    </div>
  );
}

// ── Channels Tab ──
function ChannelsTab({ clinicId }: { clinicId: string }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("other");
  const [pingStatus, setPingStatus] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-channels", clinicId],
    queryFn: () => api.get<{ success: boolean; data: { botChannels: Array<Record<string, unknown>>; marketingChannels: Record<string, unknown>[] } }>(`/clinics/${clinicId}/channels`),
  });
  const createMut = useMutation({
    mutationFn: () => api.post(`/clinics/${clinicId}/channels`, { name: newName, type: newType }),
    onSuccess: () => { hapticNotify("success"); qc.invalidateQueries({ queryKey: ["tma-clinic-channels", clinicId] }); setShowAdd(false); setNewName(""); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/clinics/${clinicId}/channels/${id}`),
    onSuccess: () => { hapticNotify("warning"); qc.invalidateQueries({ queryKey: ["tma-clinic-channels", clinicId] }); },
  });

  const handlePing = async () => {
    haptic("light"); setPingStatus("Проверяю...");
    try {
      const res = await api.post<{ success: boolean; data: { connected: boolean; stateInstance?: string; reason?: string } }>(`/clinics/${clinicId}/channels/ping`);
      setPingStatus(res.data.connected ? `✅ Подключён (${res.data.stateInstance ?? ""})` : `❌ Нет связи${res.data.reason ? ` — ${res.data.reason}` : ""}`);
    } catch { setPingStatus("❌ Ошибка"); }
  };

  if (isLoading) return <LoadingSkeleton />;
  const botChannels = data?.data?.botChannels ?? [];
  const marketingChannels = data?.data?.marketingChannels ?? [];

  return (
    <div className="space-y-4">
      {/* Bot channels */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Бот-каналы</p>
          <button onClick={handlePing} className="text-xs text-primary px-2 py-1 bg-primary/10 rounded-lg">Ping WA</button>
        </div>
        {pingStatus && <p className="text-xs text-foreground bg-muted/50 px-3 py-2 rounded-lg">{pingStatus}</p>}
        {botChannels.map((ch, i) => {
          const type = String(ch["type"] ?? "");
          const configured = Boolean(ch["configured"]);
          return (
            <div key={i} className="bg-card rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{type === "whatsapp" ? "📱" : "✈️"}</span>
                <span className="text-sm font-medium text-foreground capitalize">{type}</span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${configured ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                  {configured ? "Настроен" : "Не настроен"}
                </span>
              </div>
              {type === "whatsapp" && (
                <div className="space-y-0.5 mt-1">
                  {!!ch["idInstance"] && <p className="text-xs text-muted-foreground font-mono">idInstance: {String(ch["idInstance"])}</p>}
                  {!!ch["apiUrl"] && <p className="text-xs text-muted-foreground font-mono">apiUrl: {String(ch["apiUrl"])}</p>}
                  {!!ch["phone"] && <p className="text-xs text-muted-foreground">📞 {String(ch["phone"])}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Marketing channels */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Маркетинговые каналы</p>
        {showAdd && (
          <div className="bg-card border border-border rounded-xl p-3 space-y-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Название канала"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary" />
            <select value={newType} onChange={(e) => setNewType(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground">
              {["instagram","telegram","2gis","website","whatsapp","referral","other"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={() => { setShowAdd(false); setNewName(""); }} className="flex-1 py-1.5 bg-muted text-muted-foreground rounded-lg text-sm">Отмена</button>
              <button onClick={() => { if (newName.trim()) createMut.mutate(); }} disabled={!newName.trim() || createMut.isPending}
                className="flex-1 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">Создать</button>
            </div>
          </div>
        )}
        <button onClick={() => { haptic("medium"); setShowAdd(!showAdd); }}
          className="w-full py-2 bg-card border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-primary/50">+ Добавить канал</button>
        {!marketingChannels.length && !showAdd && <EmptyState icon="📡" text="Нет маркетинговых каналов" />}
        {marketingChannels.map((c, i) => (
          <div key={i} className="bg-card rounded-lg border border-border p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{String(c["name"] ?? "—")}</p>
              <p className="text-xs text-muted-foreground">{String(c["type"] ?? "—")} · ref: {String(c["refCode"] ?? "")}</p>
            </div>
            <button onClick={() => { haptic("medium"); tgConfirm("Удалить канал?", (ok) => { if (ok) deleteMut.mutate(String(c["id"])); }); }}
              className="text-xs text-red-400 px-2 py-1 rounded-lg border border-red-500/20">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Procedures Tab ──
function ProceduresTab({ clinicId }: { clinicId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-procedures", clinicId],
    queryFn: () => api.get<{ success: boolean; data: { templates: Record<string, unknown>[] } }>(`/clinics/${clinicId}/procedure-templates`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.templates ?? [];
  if (!items.length) return <EmptyState icon="💊" text="Нет шаблонов услуг" />;
  return (
    <div className="space-y-2">
      {items.map((t, i) => (
        <div key={i} className="bg-card rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">{String(t["name"] ?? "—")}</p>
            <p className="text-sm font-bold text-primary">{Number(t["price"] ?? 0).toLocaleString()} ₸</p>
          </div>
          <p className="text-xs text-muted-foreground">{String(t["category"] ?? "—")} · {String(t["duration"] ?? "—")} мин</p>
        </div>
      ))}
    </div>
  );
}

// ── Analytics Tab ──
function AnalyticsTab({ clinicId }: { clinicId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-analytics", clinicId],
    queryFn: () => api.get<{ success: boolean; data: { totalPatients: number; revenueThisMonth: number; proceduresThisMonth: number; revenueByMonth: { month: string; revenue: number; procedures: number }[] } }>(`/clinics/${clinicId}/analytics`),
  });
  if (isLoading) return <LoadingSkeleton rows={2} />;
  const d = data?.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Пациентов" value={d?.totalPatients ?? 0} />
        <StatCard label="Выручка / мес" value={`${(d?.revenueThisMonth ?? 0).toLocaleString()} ₸`} />
        <StatCard label="Процедур / мес" value={d?.proceduresThisMonth ?? 0} />
      </div>
      {(d?.revenueByMonth ?? []).length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">По месяцам</p>
          <div className="space-y-1">
            {(d?.revenueByMonth ?? []).map((m) => (
              <div key={m.month} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{m.month}</span>
                <span className="text-foreground font-medium">{m.revenue.toLocaleString()} ₸</span>
                <span className="text-muted-foreground">{m.procedures} проц.</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Broadcasts Tab ──
function BroadcastsTab({ clinicId }: { clinicId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-broadcasts", clinicId],
    queryFn: () => api.get<{ success: boolean; data: { broadcasts: Broadcast[]; total: number } }>(`/clinics/${clinicId}/broadcasts`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.broadcasts ?? [];
  if (!items.length) return <EmptyState icon="📢" text="Нет рассылок" />;
  const statusColors: Record<string, string> = { pending: "bg-yellow-500/20 text-yellow-400", sent: "bg-green-500/20 text-green-400", cancelled: "bg-muted text-muted-foreground" };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Всего: {data?.data?.total ?? 0}</p>
      {items.map((b) => (
        <div key={b.id} className="bg-card rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{b.type === "appointment_reminder" ? "📅 Напоминание" : "🏥 Постоп"}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[b.status] ?? "bg-muted text-muted-foreground"}`}>{b.status}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Отправка: {new Date(b.sendAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}</p>
        </div>
      ))}
    </div>
  );
}

// ── Knowledge Tab ──
function KnowledgeTab({ clinicId }: { clinicId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-knowledge", clinicId],
    queryFn: () => api.get<{ success: boolean; data: { entries: KnowledgeEntry[] } }>(`/clinics/${clinicId}/knowledge`),
  });
  const rescanMut = useMutation({
    mutationFn: (id: string) => api.post(`/clinics/${clinicId}/knowledge/${id}/rescan`),
    onSuccess: () => { hapticNotify("success"); qc.invalidateQueries({ queryKey: ["tma-clinic-knowledge", clinicId] }); tgAlert("Запрос на переиндексацию отправлен"); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/clinics/${clinicId}/knowledge/${id}`),
    onSuccess: () => { hapticNotify("warning"); qc.invalidateQueries({ queryKey: ["tma-clinic-knowledge", clinicId] }); },
  });

  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.entries ?? [];
  if (!items.length) return <EmptyState icon="📚" text="Нет источников знаний" />;
  const statusColors: Record<string, string> = { active: "bg-green-500/20 text-green-400", pending: "bg-yellow-500/20 text-yellow-400", error: "bg-red-500/20 text-red-400" };
  return (
    <div className="space-y-2">
      {items.map((e) => (
        <div key={e.id} className="bg-card rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground truncate flex-1 mr-2">{e.name}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${statusColors[e.status] ?? "bg-muted text-muted-foreground"}`}>{e.status}</span>
          </div>
          <p className="text-xs text-muted-foreground">{e.type}</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => { haptic("light"); rescanMut.mutate(e.id); }} disabled={rescanMut.isPending} className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:border-primary/50">🔄 Переиндексировать</button>
            <button onClick={() => { haptic("medium"); tgConfirm("Удалить источник?", (ok) => { if (ok) deleteMut.mutate(e.id); }); }} className="text-xs px-2 py-1 rounded-lg border border-red-500/20 text-red-400">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Contracts Tab ──
function ContractsTab({ clinicId }: { clinicId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-contracts", clinicId, page],
    queryFn: () => api.get<{ success: boolean; data: { contracts: Contract[]; total: number; templateCount: number } }>(`/clinics/${clinicId}/contracts?page=${page}`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const contracts = data?.data?.contracts ?? [];
  const total = data?.data?.total ?? 0;
  const templateCount = data?.data?.templateCount ?? 0;
  const pages = Math.ceil(total / 50);
  const statusColors: Record<string, string> = { signed: "bg-green-500/20 text-green-400", sent: "bg-blue-500/20 text-blue-400", viewed: "bg-yellow-500/20 text-yellow-400", created: "bg-muted text-muted-foreground" };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Договоров" value={total} />
        <StatCard label="Шаблонов" value={templateCount} />
      </div>
      {!contracts.length ? <EmptyState icon="📝" text="Нет договоров" /> : (
        <>
          {contracts.map((c) => (
            <div key={c.id} className="bg-card rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.patientName}</p>
                  <p className="text-xs text-muted-foreground">{c.patientPhone}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${statusColors[c.status] ?? "bg-muted text-muted-foreground"}`}>{c.status}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{new Date(c.createdAt).toLocaleDateString("ru")}</p>
            </div>
          ))}
          <Paginator page={page} pages={pages} onPage={setPage} />
        </>
      )}
    </div>
  );
}

// ── Finances Tab ──
function FinancesTab({ clinicId }: { clinicId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-finances", clinicId],
    queryFn: () => api.get<{ success: boolean; data: { revenue: number; expenses: number; payroll: number; profit: number; months: { month: string; revenue: number; expenses: number }[] } }>(`/clinics/${clinicId}/finances`),
  });
  if (isLoading) return <LoadingSkeleton rows={2} />;
  const d = data?.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Выручка / мес" value={`${(d?.revenue ?? 0).toLocaleString()} ₸`} />
        <StatCard label="Расходы / мес" value={`${(d?.expenses ?? 0).toLocaleString()} ₸`} />
        <StatCard label="ФОТ / мес" value={`${(d?.payroll ?? 0).toLocaleString()} ₸`} />
        <StatCard label="Прибыль / мес" value={`${(d?.profit ?? 0).toLocaleString()} ₸`} />
      </div>
      {(d?.months ?? []).length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">По месяцам</p>
          <div className="space-y-1">
            {(d?.months ?? []).map((m) => (
              <div key={m.month} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{m.month}</span>
                <span className="text-green-400">{m.revenue.toLocaleString()} ₸</span>
                <span className="text-red-400">-{m.expenses.toLocaleString()} ₸</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Clinic Logs Tab ──
function ClinicLogsTab({ clinicId }: { clinicId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-logs", clinicId, page],
    queryFn: () => api.get<{ success: boolean; data: { logs: Record<string, unknown>[]; total: number } }>(`/clinics/${clinicId}/logs?page=${page}`),
  });
  if (isLoading) return <LoadingSkeleton />;
  const logs = data?.data?.logs ?? [];
  const total = data?.data?.total ?? 0;
  const pages = Math.ceil(total / 50);
  if (!logs.length) return <EmptyState icon="📋" text="Нет логов" />;
  const typeColors: Record<string, string> = { create: "text-green-400", CREATE: "text-green-400", update: "text-blue-400", UPDATE: "text-blue-400", delete: "text-red-400", DELETE: "text-red-400", login: "text-purple-400" };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Всего: {total}</p>
      {logs.map((l, i) => {
        const at = String(l["actionType"] ?? "");
        const color = Object.entries(typeColors).find(([k]) => at.includes(k))?.[1] ?? "text-foreground";
        return (
          <div key={i} className="bg-card rounded-lg border border-border p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-mono font-bold ${color}`}>{at}</span>
              <span className="text-xs text-muted-foreground">{String(l["entityType"] ?? "")}</span>
            </div>
            {!!l["details"] && <p className="text-xs text-foreground/80 line-clamp-2">{String(l["details"])}</p>}
            <p className="text-xs text-muted-foreground">{new Date(String(l["createdAt"])).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}</p>
          </div>
        );
      })}
      <Paginator page={page} pages={pages} onPage={setPage} />
    </div>
  );
}

// ── Notifications Tab ──
function NotificationsTab({ clinicId }: { clinicId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-notifications", clinicId],
    queryFn: () => api.get<{ success: boolean; data: { notifications: Notification[]; total: number } }>(`/clinics/${clinicId}/notifications`),
  });
  const markReadMut = useMutation({
    mutationFn: (id: string) => api.patch(`/clinics/${clinicId}/notifications/${id}`, { read: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tma-clinic-notifications", clinicId] }),
  });

  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.notifications ?? [];
  if (!items.length) return <EmptyState icon="🔔" text="Нет уведомлений" />;
  const typeIcons: Record<string, string> = { red_alert: "🚨", new_message: "💬", appointment: "📅", system: "⚙️", appointment_reminder: "⏰", pending_payment: "💳" };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Всего: {data?.data?.total ?? 0}</p>
      {items.map((n) => (
        <div key={n.id} className={`bg-card rounded-lg border p-3 ${n.read ? "border-border opacity-60" : "border-primary/30"}`}>
          <div className="flex items-start gap-2">
            <span className="text-lg">{typeIcons[n.type] ?? "🔔"}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{n.message}</p>
              <p className="text-xs text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}</p>
            </div>
            {!n.read && (
              <button onClick={() => { haptic("light"); markReadMut.mutate(n.id); }} className="text-xs text-primary flex-shrink-0">✓</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Files Tab ──
function FilesTab({ clinicId }: { clinicId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["tma-clinic-files", clinicId],
    queryFn: () => api.get<{ success: boolean; data: { files: ClinicFile[]; total: number } }>(`/clinics/${clinicId}/files`),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/clinics/${clinicId}/files/${id}`),
    onSuccess: () => { hapticNotify("warning"); qc.invalidateQueries({ queryKey: ["tma-clinic-files", clinicId] }); },
  });

  if (isLoading) return <LoadingSkeleton />;
  const items = data?.data?.files ?? [];
  if (!items.length) return <EmptyState icon="📁" text="Нет файлов" />;
  const sourceLabels: Record<string, string> = { contract_template: "📝 Шаблон", knowledge_source: "📚 База знаний" };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Всего: {data?.data?.total ?? 0}</p>
      {items.map((f) => (
        <div key={f.id} className="bg-card rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
              <p className="text-xs text-muted-foreground">{sourceLabels[f.source] ?? f.source} · {f.type}</p>
            </div>
            <div className="flex gap-1">
              {f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary px-2 py-1 rounded-lg border border-primary/30">↗</a>}
              <button
                onClick={() => { haptic("medium"); tgConfirm("Удалить файл?", (ok) => { if (ok) deleteMut.mutate(f.id); }); }}
                className="text-xs text-red-400 px-2 py-1 rounded-lg border border-red-500/20"
              >✕</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main ClinicDetailPage ──
export default function ClinicDetailPage() {
  const { clinicId } = useParams<{ clinicId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("info");

  const handleBack = useCallback(() => { haptic("light"); navigate("/clinics"); }, [navigate]);

  useEffect(() => {
    try {
      WebApp.BackButton.show();
      const handler = () => handleBack();
      WebApp.BackButton.onClick(handler);
      return () => { WebApp.BackButton.offClick(handler); WebApp.BackButton.hide(); };
    } catch {
      return undefined;
    }
  }, [handleBack]);

  if (!clinicId) { navigate("/clinics"); return null; }

  const tabContent: Record<Tab, React.JSX.Element> = {
    info: <InfoTab clinicId={clinicId} />,
    users: <UsersTab clinicId={clinicId} />,
    patients: <PatientsTab clinicId={clinicId} />,
    chatbot: <ChatbotTab clinicId={clinicId} />,
    sessions: <SessionsTab clinicId={clinicId} />,
    messages: <MessagesTab clinicId={clinicId} />,
    channels: <ChannelsTab clinicId={clinicId} />,
    procedures: <ProceduresTab clinicId={clinicId} />,
    analytics: <AnalyticsTab clinicId={clinicId} />,
    broadcasts: <BroadcastsTab clinicId={clinicId} />,
    knowledge: <KnowledgeTab clinicId={clinicId} />,
    contracts: <ContractsTab clinicId={clinicId} />,
    finances: <FinancesTab clinicId={clinicId} />,
    logs: <ClinicLogsTab clinicId={clinicId} />,
    notifications: <NotificationsTab clinicId={clinicId} />,
    files: <FilesTab clinicId={clinicId} />,
  };

  const currentTab = TABS.find((t) => t.id === tab)!;

  return (
    <div className="flex flex-col min-h-screen">
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={handleBack} className="w-8 h-8 flex items-center justify-center text-muted-foreground text-lg">←</button>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-foreground text-base leading-tight">Клиника</h2>
            <p className="text-xs text-muted-foreground">{currentTab.icon} {currentTab.label}</p>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-3 px-4" style={{ scrollbarWidth: "none" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { haptic("light"); setTab(t.id); }}
              className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                tab === t.id ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground"
              }`}
            >{t.icon} {t.label}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 px-4 py-4 pb-8">{tabContent[tab]}</div>
    </div>
  );
}

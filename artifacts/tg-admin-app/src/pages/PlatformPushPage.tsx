import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Send } from "lucide-react";
import { api } from "../lib/api";
import { haptic, hapticNotify, tgAlert, tgConfirm, useTgBackButton } from "../hooks/useTgBackButton";
import { TmaPage } from "@/components/layout/tma-page";
import { IosSection } from "@/components/layout/ios-group";
import {
  CUSTOM_PUSH_DESTINATION,
  isKnownPushDestination,
  PUSH_DESTINATION_GROUPS,
  PUSH_DESTINATIONS,
} from "@/lib/push-destinations";

interface PushStats {
  devices: number;
  users: number;
  clinics: number;
}

interface PushBroadcast {
  id: string;
  title: string;
  body: string;
  url: string | null;
  clinicId: string | null;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdByName: string | null;
  createdAt: string;
}

interface ClinicRow {
  id: string;
  name: string;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3 text-center">
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export default function PlatformPushPage() {
  const navigate = useNavigate();
  useTgBackButton(() => navigate(-1));

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [destination, setDestination] = useState("/");
  const [customUrl, setCustomUrl] = useState("");
  const [clinicId, setClinicId] = useState("");

  const resolvedUrl =
    destination === CUSTOM_PUSH_DESTINATION ? customUrl.trim() || "/" : destination;
  const qc = useQueryClient();

  const statsQueryKey = ["tma-push-stats", clinicId || "all"];

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: statsQueryKey,
    queryFn: () => {
      const params = clinicId ? `?clinicId=${encodeURIComponent(clinicId)}` : "";
      return api.get<{ success: boolean; data: PushStats }>(`/push/broadcasts/stats${params}`);
    },
  });

  const { data: clinicsData } = useQuery({
    queryKey: ["tma-clinics-list-short"],
    queryFn: () => api.get<{ success: boolean; data: { clinics: ClinicRow[] } }>("/clinics?limit=200"),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["tma-push-broadcasts"],
    queryFn: () => api.get<{ success: boolean; data: { broadcasts: PushBroadcast[] } }>("/push/broadcasts"),
  });

  const sendMut = useMutation({
    mutationFn: () =>
      api.post<{ success: boolean; data: { sent: number; failed: number; total: number } }>(
        "/push/broadcasts",
        {
          title: title.trim(),
          body: body.trim(),
          url: resolvedUrl,
          ...(clinicId ? { clinicId } : {}),
        },
      ),
    onSuccess: (res) => {
      hapticNotify("success");
      const { sent, failed, total } = res.data;
      tgAlert(`Отправлено: ${sent} из ${total}${failed ? ` (ошибок: ${failed})` : ""}`);
      setTitle("");
      setBody("");
      void qc.invalidateQueries({ queryKey: ["tma-push-broadcasts"] });
      void qc.invalidateQueries({ queryKey: statsQueryKey });
    },
    onError: (err: Error) => {
      hapticNotify("error");
      tgAlert(err.message || "Не удалось отправить рассылку");
    },
  });

  const stats = statsData?.data;
  const clinics = clinicsData?.data?.clinics ?? [];
  const broadcasts = historyData?.data?.broadcasts ?? [];

  const handleSend = () => {
    if (!title.trim() || !body.trim()) {
      tgAlert("Заполните заголовок и текст");
      return;
    }
    if (!stats?.devices) {
      tgAlert("Нет получателей с включённым push. Пользователи должны включить уведомления в PWA.");
      return;
    }

    tgConfirm(
      `Отправить push ${stats.devices} устройствам (${stats.users} пользователей)?`,
      (ok) => {
        if (ok) sendMut.mutate();
      },
    );
  };

  return (
    <TmaPage title="Push-рассылка PWA" subtitle="Всем, у кого включены уведомления в приложении">
      <div className="space-y-4 px-4 pb-8">
        <IosSection title="Получатели">
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Устройств" value={statsLoading ? 0 : stats?.devices ?? 0} />
            <StatCard label="Пользователей" value={statsLoading ? 0 : stats?.users ?? 0} />
            <StatCard label="Клиник" value={statsLoading ? 0 : stats?.clinics ?? 0} />
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Отправка только на устройства с активной push-подпиской (включено в профиле CRM → Push-уведомления).
          </p>
        </IosSection>

        <IosSection title="Аудитория">
          <select
            value={clinicId}
            onChange={(e) => setClinicId(e.target.value)}
            className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            <option value="">Все клиники</option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </IosSection>

        <IosSection title="Сообщение">
          <div className="space-y-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Заголовок push"
              maxLength={120}
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Текст уведомления..."
              rows={4}
              maxLength={500}
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary resize-none"
            />
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Страница при нажатии</label>
              <select
                value={isKnownPushDestination(destination) ? destination : CUSTOM_PUSH_DESTINATION}
                onChange={(e) => {
                  const next = e.target.value;
                  setDestination(next);
                  if (next !== CUSTOM_PUSH_DESTINATION) setCustomUrl("");
                }}
                className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
              >
                {PUSH_DESTINATION_GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {PUSH_DESTINATIONS.filter((d) => d.group === group).map((d) => (
                      <option key={d.path} value={d.path}>
                        {d.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value={CUSTOM_PUSH_DESTINATION}>Другая ссылка...</option>
              </select>
              {(destination === CUSTOM_PUSH_DESTINATION || !isKnownPushDestination(destination)) && (
                <input
                  value={customUrl}
                  onChange={(e) => {
                    setCustomUrl(e.target.value);
                    setDestination(CUSTOM_PUSH_DESTINATION);
                  }}
                  placeholder="Своя ссылка (например /branches)"
                  className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary"
                />
              )}
              <p className="text-[11px] text-muted-foreground">
                Откроется: <span className="font-mono">{resolvedUrl}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { haptic("medium"); handleSend(); }}
            disabled={sendMut.isPending || !title.trim() || !body.trim() || !stats?.devices}
            className="mt-3 w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {sendMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sendMut.isPending ? "Отправка..." : "Отправить push-рассылку"}
          </button>
        </IosSection>

        <IosSection title="История">
          {historyLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : broadcasts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Рассылок пока не было</p>
          ) : (
            <div className="space-y-2">
              {broadcasts.map((b) => (
                <div key={b.id} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{b.title}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(b.createdAt).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{b.body}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    ✓ {b.sentCount}/{b.recipientCount}
                    {b.failedCount > 0 ? ` · ошибок ${b.failedCount}` : ""}
                    {b.createdByName ? ` · ${b.createdByName}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </IosSection>
      </div>
    </TmaPage>
  );
}

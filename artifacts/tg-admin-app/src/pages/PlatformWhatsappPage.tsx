import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { haptic, hapticNotify, tgAlert, tgConfirm, useTgBackButton } from "../hooks/useTgBackButton";

interface PlatformWhatsappInstance {
  id: string;
  label: string;
  greenApiInstanceId: string;
  greenApiToken: string;
  greenApiUrl: string | null;
  whatsappPhone: string | null;
  isDefault: boolean;
  createdAt: string;
}

function formatPhone(digits: string | null): string {
  if (!digits) return "—";
  const d = digits.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("7")) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9, 11)}`;
  }
  return digits;
}

export default function PlatformWhatsappPage() {
  const navigate = useNavigate();
  useTgBackButton(() => navigate("/content"));
  const qc = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState("1Dent OTP");
  const [instanceId, setInstanceId] = useState("");
  const [token, setToken] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [autoProvision, setAutoProvision] = useState(true);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["tma-platform-whatsapp"],
    queryFn: () =>
      api.get<{ success: boolean; data: { instances: PlatformWhatsappInstance[] } }>("/platform/whatsapp"),
  });

  const instances = data?.data?.instances ?? [];

  const addInstance = useMutation({
    mutationFn: () =>
      api.post<{ success: boolean; data: { instance: PlatformWhatsappInstance } }>("/platform/whatsapp", {
        label,
        autoProvision,
        greenApiInstanceId: autoProvision ? undefined : instanceId.trim(),
        greenApiToken: autoProvision ? undefined : token.trim(),
        greenApiUrl: apiUrl.trim() || null,
        whatsappPhone: phone.replace(/\D/g, "") || null,
        isDefault: instances.length === 0,
      }),
    onSuccess: () => {
      hapticNotify("success");
      setShowAdd(false);
      setLabel("1Dent OTP");
      setInstanceId("");
      setToken("");
      setApiUrl("");
      setPhone("");
      void qc.invalidateQueries({ queryKey: ["tma-platform-whatsapp"] });
      tgAlert("Инстанс добавлен");
    },
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => api.patch(`/platform/whatsapp/${id}`, { isDefault: true }),
    onSuccess: () => {
      haptic("light");
      void qc.invalidateQueries({ queryKey: ["tma-platform-whatsapp"] });
    },
  });

  const removeInstance = useMutation({
    mutationFn: (id: string) => api.delete(`/platform/whatsapp/${id}`),
    onSuccess: () => {
      hapticNotify("success");
      void qc.invalidateQueries({ queryKey: ["tma-platform-whatsapp"] });
    },
  });

  const checkStatus = useMutation({
    mutationFn: (id: string) =>
      api.get<{ success: boolean; data: { state: string; phone: string | null } }>(
        `/platform/whatsapp/${id}/status`,
      ),
    onSuccess: (res) => {
      hapticNotify("success");
      tgAlert(`Статус: ${res.data.state}\nТелефон: ${formatPhone(res.data.phone)}`);
    },
  });

  const loadQr = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.get<{ success: boolean; data: { type: string; message: string } }>(
        `/platform/whatsapp/${id}/qr`,
      );
      return res.data;
    },
    onSuccess: (data, id) => {
      setQrFor(id);
      setQrData(data.message);
    },
  });

  const registerWebhook = useMutation({
    mutationFn: (id: string) =>
      api.post<{ success: boolean; data: { webhookUrl: string } }>(
        `/platform/whatsapp/${id}/register-webhook`,
      ),
    onSuccess: (res) => {
      hapticNotify("success");
      tgAlert(`Webhook: ${res.data.webhookUrl}`);
    },
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Загрузка...</div>;
  }

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">WhatsApp 1Dent</h1>
        <p className="text-sm text-muted-foreground">
          Системные инстансы для OTP, входа и приглашений сотрудников
        </p>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 leading-relaxed">
        Коды и пароли отправляются с номера 1Dent, а не с WhatsApp клиники. Отметьте один инстанс как основной.
      </div>

      <div className="flex justify-between items-center">
        <p className="text-sm font-semibold text-foreground">Инстансы ({instances.length})</p>
        <button
          type="button"
          onClick={() => { haptic("light"); setShowAdd((v) => !v); }}
          className="text-xs text-primary px-3 py-1.5 bg-primary/10 rounded-lg font-medium"
        >
          {showAdd ? "Отмена" : "+ Добавить"}
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Название (например: 1Dent OTP)"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
          />

          <button
            type="button"
            onClick={() => setAutoProvision((v) => !v)}
            className={`w-full py-2 rounded-lg text-sm font-semibold ${
              autoProvision ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {autoProvision ? "Авто-создание через Partner API" : "Ручной ввод credentials"}
          </button>

          {!autoProvision && (
            <>
              <input
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                placeholder="Instance ID"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
              />
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="API Token"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
              />
              <input
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="API URL (опционально)"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </>
          )}

          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Номер WhatsApp (опционально)"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
          />

          <button
            type="button"
            disabled={addInstance.isPending || (!autoProvision && (!instanceId.trim() || !token.trim()))}
            onClick={() => { haptic("medium"); addInstance.mutate(); }}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {addInstance.isPending ? "Создание..." : "Добавить инстанс"}
          </button>
        </div>
      )}

      {instances.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Нет инстансов. Добавьте WhatsApp 1Dent для отправки кодов.
        </p>
      ) : (
        <div className="space-y-2">
          {instances.map((inst) => (
            <div key={inst.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">{inst.label}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    ID {inst.greenApiInstanceId}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatPhone(inst.whatsappPhone)}
                  </p>
                </div>
                {inst.isDefault && (
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                    Основной
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {!inst.isDefault && (
                  <button
                    type="button"
                    onClick={() => setDefault.mutate(inst.id)}
                    className="text-xs py-2 rounded-lg bg-muted text-foreground font-medium"
                  >
                    Сделать основным
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => checkStatus.mutate(inst.id)}
                  className="text-xs py-2 rounded-lg bg-muted text-foreground font-medium"
                >
                  Статус
                </button>
                <button
                  type="button"
                  onClick={() => loadQr.mutate(inst.id)}
                  className="text-xs py-2 rounded-lg bg-muted text-foreground font-medium"
                >
                  QR-код
                </button>
                <button
                  type="button"
                  onClick={() => registerWebhook.mutate(inst.id)}
                  className="text-xs py-2 rounded-lg bg-muted text-foreground font-medium"
                >
                  Webhook
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic("medium");
                    tgConfirm("Удалить инстанс?", (ok) => {
                      if (ok) removeInstance.mutate(inst.id);
                    });
                  }}
                  className="text-xs py-2 rounded-lg bg-destructive/10 text-destructive font-medium col-span-2"
                >
                  Удалить
                </button>
              </div>

              {qrFor === inst.id && qrData && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground mb-2">Отсканируйте QR в WhatsApp</p>
                  <img src={`data:image/png;base64,${qrData}`} alt="QR" className="mx-auto max-w-[220px] rounded-lg" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

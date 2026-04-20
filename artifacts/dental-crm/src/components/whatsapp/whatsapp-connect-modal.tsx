import { useState, useRef, useEffect, useCallback } from "react";
import { customFetch } from "@workspace/api-client-react";
import { X, Check, Copy, CheckCircle2, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function extractApiErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    // ApiError has a .data field with the parsed API response
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const errorField = (data as Record<string, unknown>).error;
      const messageField = (data as Record<string, unknown>).message;
      if (typeof errorField === "string" && errorField) return errorField;
      if (typeof messageField === "string" && messageField) return messageField;
    }
  }
  return err instanceof Error ? err.message : "Неизвестная ошибка";
}

const BRAND = "#98cc1c";

export const WA_ICON_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z";

export function WhatsAppIcon({ size = 16, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ flexShrink: 0 }} fill={color}>
      <path d={WA_ICON_PATH} />
    </svg>
  );
}

export interface WaStatus {
  configured: boolean;
  connected: boolean;
  phone: string | null;
}

interface WaQr {
  type: string;
  message: string;
}

export function WhatsAppConnectModal({
  open,
  onClose,
  onConnected,
  startAtSetup,
  forceSetup,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: (phone: string | null) => void;
  startAtSetup?: boolean;
  forceSetup?: boolean;
}) {
  const { toast } = useToast();
  // Steps: intro → phone (enter real number) → setup (Green API credentials + QR)
  const [step, setStep] = useState<"intro" | "phone" | "setup">(
    forceSetup ? "phone" : startAtSetup ? "setup" : "intro"
  );
  const [instanceId, setInstanceId] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);

  // Real clinic WhatsApp phone (step 1 — independent of Green API)
  const [clinicPhone, setClinicPhone] = useState("");
  const [clinicPhoneSaving, setClinicPhoneSaving] = useState(false);

  // QR state
  const [qr, setQr] = useState<WaQr | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const [status, setStatus] = useState<WaStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Saving credentials progress
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveStage, setSaveStage] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await customFetch<{ success: boolean; data: WaStatus }>(
        "/api/clinic/green-api/status",
      );
      setStatus(res.data);
      if (res.data.connected) {
        onConnected(res.data.phone);
      }
    } catch {
      setStatus(null);
    }
  }, [onConnected]);

  const fetchQr = useCallback(async () => {
    try {
      const res = await customFetch<{ success: boolean; data: WaQr }>(
        "/api/clinic/green-api/qr",
      );
      setQrError(null);
      setQr(res.data);
      setConfigured(true);
      if (res.data.type === "alreadyLogged") {
        await fetchStatus();
      }
    } catch (err) {
      setQr(null);
      setQrError(extractApiErrorMessage(err));
    }
  }, [fetchStatus]);

  useEffect(() => {
    if (!open) return;
    if (forceSetup) {
      setStep("setup");
      return;
    }
    if (startAtSetup) {
      setStep("setup");
      setInitialLoading(true);
      Promise.all([fetchQr(), fetchStatus()]).finally(() => {
        setInitialLoading(false);
      });
    }
  }, [open, startAtSetup, forceSetup, fetchQr, fetchStatus]);

  useEffect(() => {
    if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    if (!configured || status?.connected) return;
    qrIntervalRef.current = setInterval(fetchQr, 20_000);
    // Poll every 5s so the UI reacts within seconds after QR scan
    statusIntervalRef.current = setInterval(fetchStatus, 5_000);
    return () => {
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, [configured, status?.connected, fetchQr, fetchStatus]);

  useEffect(() => {
    if (!open) {
      setStep(forceSetup ? "phone" : startAtSetup ? "setup" : "intro");
      setInstanceId("");
      setToken("");
      setSaving(false);
      setConfigured(false);
      setClinicPhone("");
      setClinicPhoneSaving(false);
      setQr(null);
      setQrError(null);
      setStatus(null);
      setInitialLoading(false);
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    }
  }, [open, startAtSetup, forceSetup]);

  const handleClinicPhoneSave = async () => {
    const digits = clinicPhone.replace(/\D/g, "");
    if (!digits || digits.length < 7 || digits.length > 15) {
      toast({ title: "Введите корректный номер (например 77071234567)", variant: "destructive" });
      return;
    }
    setClinicPhoneSaving(true);
    try {
      await customFetch("/api/clinic/whatsapp-phone", {
        method: "PATCH",
        body: JSON.stringify({ phone: digits }),
        headers: { "Content-Type": "application/json" },
      });
      setStep("setup");
    } catch {
      toast({ title: "Ошибка сохранения номера", variant: "destructive" });
    } finally {
      setClinicPhoneSaving(false);
    }
  };

  const SAVE_STAGES = [
    { threshold: 0,  label: "Сохраняем данные инстанса..." },
    { threshold: 40, label: "Проверяем подключение к Green API..." },
    { threshold: 72, label: "Запрашиваем QR-код..." },
  ];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceId.trim() || !token.trim()) return;
    setSaving(true);
    setSaveProgress(0);
    setSaveStage(SAVE_STAGES[0].label);

    const startMs = Date.now();
    const TOTAL_MS = 5_000;
    saveTimerRef.current = setInterval(() => {
      const pct = Math.min(85, Math.floor(((Date.now() - startMs) / TOTAL_MS) * 85));
      setSaveProgress(pct);
      const stage = [...SAVE_STAGES].reverse().find(s => pct >= s.threshold);
      setSaveStage(stage?.label ?? "");
    }, 100);

    try {
      await customFetch("/api/clinic/green-api", {
        method: "PATCH",
        body: JSON.stringify({ greenApiInstanceId: instanceId.trim(), greenApiToken: token.trim() }),
      });
      setSaveProgress(100);
      setSaveStage("Данные сохранены!");
      await new Promise(r => setTimeout(r, 500));

      setStatus(null);
      setConfigured(true);
      setQr(null);
      void Promise.all([fetchQr(), fetchStatus()]);
    } catch {
      setSaveProgress(100);
      setSaveStage("Ошибка сохранения");
      await new Promise(r => setTimeout(r, 400));
      toast({ title: "Ошибка сохранения", variant: "destructive" });
    } finally {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
      setSaving(false);
      setSaveProgress(0);
      setSaveStage("");
    }
  };

  const copyInstanceId = () => {
    navigator.clipboard.writeText(instanceId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!open) return null;

  const isConnected = status?.connected && !forceSetup;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={isConnected ? onClose : undefined}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {(step === "setup" || isConnected) && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {step === "intro" && (
          <div className="flex flex-col items-center px-8 py-10 text-center">
            <button
              onClick={onClose}
              className="absolute top-3 left-3 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg mb-5"
              style={{ backgroundColor: "#25D366" + "20" }}
            >
              <WhatsAppIcon size={46} color="#25D366" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Подключите WhatsApp</h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-6">
              Подключите WhatsApp вашей клиники, чтобы отправлять сообщения пациентам,
              напоминания и постоперационные уведомления прямо из CRM.
            </p>
            <div className="w-full space-y-3 text-left mb-7">
              {[
                "Укажите номер WhatsApp вашей клиники",
                "Введите данные вашего Green API инстанса",
                "Отсканируйте QR-код на телефоне клиники",
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white mt-0.5"
                    style={{ backgroundColor: BRAND }}
                  >
                    {i + 1}
                  </div>
                  <p className="text-sm text-gray-600">{s}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setStep("phone")}
              className="w-full h-11 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: "#25D366" }}
            >
              Подключить WhatsApp
            </button>
          </div>
        )}

        {step === "phone" && (
          <div className="p-6">
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2.5 mb-5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "#25D366" + "20" }}
              >
                <WhatsAppIcon size={20} color="#25D366" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 leading-tight">Номер WhatsApp клиники</h2>
                <p className="text-xs text-gray-400">Шаг 1 из 2</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-4 leading-relaxed">
              Введите номер телефона, на котором работает WhatsApp вашей клиники. Он будет использоваться для реферальных ссылок и отображения в CRM.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Номер WhatsApp (международный формат)
                </label>
                <input
                  type="tel"
                  value={clinicPhone}
                  onChange={e => setClinicPhone(e.target.value)}
                  placeholder="77071234567"
                  className="w-full h-10 rounded-lg border border-border bg-white px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#98cc1c]/30"
                  onKeyDown={e => { if (e.key === "Enter") void handleClinicPhoneSave(); }}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">
                  Введите цифры без «+» и пробелов. Например: <span className="font-mono">77071234567</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleClinicPhoneSave()}
                disabled={clinicPhoneSaving || !clinicPhone.trim()}
                className="w-full h-10 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
              >
                {clinicPhoneSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {clinicPhoneSaving ? "Сохранение..." : "Далее →"}
              </button>
            </div>
          </div>
        )}

        {step === "setup" && (
          <div className="p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "#25D366" + "20" }}
              >
                <WhatsAppIcon size={20} color="#25D366" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 leading-tight">
                  {initialLoading ? "Загрузка..." : isConnected ? "WhatsApp подключён" : "Данные Green API"}
                </h2>
                <p className="text-xs text-gray-400">{isConnected ? "Подключён" : "Шаг 2 из 2"}</p>
              </div>
            </div>

            {initialLoading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
                <p className="text-sm text-gray-400">Проверка статуса...</p>
              </div>
            ) : isConnected ? (
              <div className="text-center py-4">
                <CheckCircle2 className="w-14 h-14 mx-auto mb-3 text-green-500" />
                <p className="font-semibold text-gray-800 text-base mb-1">WhatsApp успешно подключён!</p>
                {status?.phone && (
                  <p className="text-sm text-gray-500">
                    Номер <span className="font-mono font-semibold text-gray-700">+{status.phone}</span>{" "}
                    добавлен в раздел Каналы
                  </p>
                )}
                <button
                  onClick={onClose}
                  className="mt-5 w-full h-10 rounded-xl text-sm font-semibold text-white"
                  style={{ backgroundColor: BRAND }}
                >
                  Готово
                </button>
              </div>
            ) : (
              <>
                {!configured && (
                  <>
                    {/* ── Saving progress (shown while credentials are being saved) ── */}
                    {saving && (
                      <div className="flex flex-col items-center py-6 gap-5">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#25D366" + "18" }}>
                          <WhatsAppIcon size={36} color="#25D366" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-gray-900 mb-1">Подключение к Green API</p>
                          <p className="text-xs text-gray-400 min-h-[16px]">{saveStage}</p>
                        </div>
                        <div className="text-5xl font-bold tabular-nums transition-all duration-150"
                          style={{ color: saveProgress === 100 ? "#22c55e" : BRAND }}>
                          {saveProgress}%
                        </div>
                        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-150 ease-linear"
                            style={{
                              width: `${saveProgress}%`,
                              backgroundColor: saveProgress === 100 ? "#22c55e" : BRAND,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Credentials form — hidden while saving */}
                    {!saving && (
                      <>
                        <form onSubmit={handleSave} className="space-y-3 mb-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              ID инстанса (idInstance)
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                value={instanceId}
                                onChange={(e) => setInstanceId(e.target.value)}
                                placeholder="1234567890"
                                className="w-full h-9 rounded-lg border border-border bg-white px-3 pr-9 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#98cc1c]/30"
                              />
                              {instanceId && (
                                <button
                                  type="button"
                                  onClick={copyInstanceId}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              API токен (apiTokenInstance)
                            </label>
                            <input
                              type="password"
                              value={token}
                              onChange={(e) => setToken(e.target.value)}
                              placeholder="••••••••••••••••••••••"
                              className="w-full h-9 rounded-lg border border-border bg-white px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#98cc1c]/30"
                            />
                          </div>
                          <p className="text-xs text-gray-400">
                            Данные из личного кабинета{" "}
                            <a
                              href="https://green-api.com"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#98cc1c] hover:underline"
                            >
                              green-api.com
                            </a>
                          </p>
                          <button
                            type="submit"
                            disabled={!instanceId.trim() || !token.trim()}
                            className="w-full h-10 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: BRAND }}
                          >
                            Сохранить и получить QR
                          </button>
                        </form>
                      </>
                    )}
                  </>
                )}

                {/* ── QR ── */}
                {configured && (
                  <>
                    {!qr && !qrError && (
                      <div className="flex flex-col items-center justify-center py-8 gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
                        <p className="text-sm text-gray-400">Запрашиваем QR-код у Green API...</p>
                      </div>
                    )}

                    {!qr && qrError && (
                      <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                          <AlertTriangle className="w-6 h-6 text-red-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-700 mb-1">Не удалось получить QR-код</p>
                          <p className="text-xs text-gray-400 leading-relaxed max-w-xs">
                            {qrError}
                          </p>
                        </div>
                        <div className="flex gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => { setConfigured(false); setQrError(null); setQr(null); setStatus(null); }}
                            className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-border text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            Изменить данные
                          </button>
                          <button
                            type="button"
                            onClick={() => { setQrError(null); void fetchQr(); }}
                            className="flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold text-white transition-colors"
                            style={{ backgroundColor: BRAND }}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Попробовать снова
                          </button>
                        </div>
                      </div>
                    )}

                    {qr && (
                      <div className="text-center">
                        {qr.type === "qrCode" ? (
                          <>
                            <p className="text-xs text-gray-500 mb-3">
                              Отсканируйте QR с телефона → WhatsApp → Привязанные устройства
                            </p>
                            <div className="flex justify-center mb-3">
                              <img
                                src={`data:image/png;base64,${qr.message}`}
                                alt="WhatsApp QR"
                                className="w-48 h-48 rounded-xl border border-border shadow-sm"
                              />
                            </div>
                            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Ожидание сканирования...
                            </div>
                          </>
                        ) : qr.type === "alreadyLogged" ? (
                          <div className="py-2">
                            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
                            <p className="text-sm font-semibold text-gray-700">WhatsApp уже подключён</p>
                          </div>
                        ) : (
                          <div className="py-2">
                            <p className="text-sm text-gray-500">{qr.type}: {qr.message}</p>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => { setConfigured(false); setQr(null); setStatus(null); }}
                          className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
                        >
                          Изменить данные
                        </button>
                      </div>
                    )}
                  </>
                )}

              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

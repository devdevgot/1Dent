import { useState, useRef, useEffect, useCallback } from "react";
import { customFetch } from "@workspace/api-client-react";
import { X, Check, Copy, CheckCircle2, Loader2, AlertTriangle, RefreshCw, Smartphone, QrCode } from "lucide-react";
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

type ConnectMethod = "qr" | "phone";

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
  const [step, setStep] = useState<"intro" | "setup">(startAtSetup ? "setup" : "intro");
  const [instanceId, setInstanceId] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);

  // Method selector
  const [method, setMethod] = useState<ConnectMethod>("qr");

  // QR state
  const [qr, setQr] = useState<WaQr | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  // Phone pairing state
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);

  const [status, setStatus] = useState<WaStatus | null>(null);
  const [copied, setCopied] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const requestPairingCode = async () => {
    if (!pairingPhone.trim()) return;
    setPairingLoading(true);
    setPairingError(null);
    setPairingCode(null);
    try {
      const res = await customFetch<{ success: boolean; data: { code: string } }>(
        "/api/clinic/green-api/pairing-code",
        { method: "POST", body: JSON.stringify({ phoneNumber: pairingPhone.trim() }) },
      );
      setPairingCode(res.data.code);
    } catch (err) {
      setPairingError(extractApiErrorMessage(err));
    } finally {
      setPairingLoading(false);
    }
  };

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
    if (method === "qr") {
      qrIntervalRef.current = setInterval(fetchQr, 20_000);
    }
    statusIntervalRef.current = setInterval(fetchStatus, 15_000);
    return () => {
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, [configured, status?.connected, method, fetchQr, fetchStatus]);

  useEffect(() => {
    if (!open) {
      setStep(startAtSetup ? "setup" : "intro");
      setInstanceId("");
      setToken("");
      setSaving(false);
      setConfigured(false);
      setQr(null);
      setQrError(null);
      setStatus(null);
      setInitialLoading(false);
      setPairingPhone("");
      setPairingCode(null);
      setPairingError(null);
      setPairingLoading(false);
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    }
  }, [open, startAtSetup]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instanceId.trim() || !token.trim()) return;
    setSaving(true);
    try {
      await customFetch("/api/clinic/green-api", {
        method: "PATCH",
        body: JSON.stringify({ greenApiInstanceId: instanceId.trim(), greenApiToken: token.trim() }),
      });
      setStatus(null);
      setConfigured(true);
      setQr(null);
      if (method === "qr") {
        toast({ title: "Данные сохранены. Запрашиваем QR-код..." });
        void Promise.all([fetchQr(), fetchStatus()]);
      } else {
        toast({ title: "Данные сохранены. Введите номер телефона для получения кода." });
        void fetchStatus();
      }
    } catch {
      toast({ title: "Ошибка сохранения", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const copyInstanceId = () => {
    navigator.clipboard.writeText(instanceId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const copyPairingCode = (code: string) => {
    navigator.clipboard.writeText(code.replace("-", "")).then(() => {
      toast({ title: "Код скопирован" });
    });
  };

  const handleMethodChange = (m: ConnectMethod) => {
    setMethod(m);
    setQr(null);
    setQrError(null);
    setPairingCode(null);
    setPairingError(null);
    setPairingPhone("");
    if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
    if (m === "qr" && configured) {
      void fetchQr();
    }
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
                "Введите данные вашего Green API инстанса",
                "Выберите способ: QR-код или номер телефона",
                "Номер автоматически добавится в каналы",
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
              onClick={() => setStep("setup")}
              className="w-full h-11 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: "#25D366" }}
            >
              Подключить WhatsApp
            </button>
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
                  {initialLoading ? "Загрузка..." : isConnected ? "WhatsApp подключён" : "Настройка WhatsApp"}
                </h2>
                <p className="text-xs text-gray-400">Green API</p>
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
                    {/* Method selector */}
                    <div className="flex rounded-xl overflow-hidden border border-border mb-4">
                      <button
                        type="button"
                        onClick={() => setMethod("qr")}
                        className={`flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-medium transition-colors ${
                          method === "qr"
                            ? "text-white"
                            : "text-gray-500 hover:bg-gray-50"
                        }`}
                        style={method === "qr" ? { backgroundColor: BRAND } : undefined}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        QR-код
                      </button>
                      <button
                        type="button"
                        onClick={() => setMethod("phone")}
                        className={`flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-medium transition-colors border-l border-border ${
                          method === "phone"
                            ? "text-white"
                            : "text-gray-500 hover:bg-gray-50"
                        }`}
                        style={method === "phone" ? { backgroundColor: BRAND } : undefined}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        По номеру
                      </button>
                    </div>

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
                        disabled={saving || !instanceId.trim() || !token.trim()}
                        className="w-full h-10 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: BRAND }}
                      >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {saving
                          ? "Сохранение..."
                          : method === "qr"
                          ? "Сохранить и получить QR"
                          : "Сохранить"}
                      </button>
                    </form>
                  </>
                )}

                {/* ── QR method ── */}
                {configured && method === "qr" && (
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
                            Проверьте правильность ID инстанса и токена в личном кабинете Green API.
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

                {/* ── Phone / pairing code method ── */}
                {configured && method === "phone" && (
                  <div>
                    {!pairingCode ? (
                      <>
                        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                          Введите номер телефона, привязанного к WhatsApp на устройстве клиники.
                          Вы получите 8-значный код.
                        </p>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                              Номер телефона (с кодом страны)
                            </label>
                            <input
                              type="tel"
                              value={pairingPhone}
                              onChange={(e) => setPairingPhone(e.target.value)}
                              placeholder="77001234567"
                              className="w-full h-9 rounded-lg border border-border bg-white px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#98cc1c]/30"
                            />
                            <p className="text-xs text-gray-400 mt-1">Только цифры, без +</p>
                          </div>

                          {pairingError && (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
                              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                              <p className="text-xs text-red-600 leading-relaxed">{pairingError}</p>
                            </div>
                          )}

                          <button
                            type="button"
                            disabled={pairingLoading || !pairingPhone.trim()}
                            onClick={() => void requestPairingCode()}
                            className="w-full h-10 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: BRAND }}
                          >
                            {pairingLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {pairingLoading ? "Запрашиваем код..." : "Получить код"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center">
                        <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                          Откройте WhatsApp на телефоне клиники →{" "}
                          <span className="font-medium text-gray-700">Настройки</span> →{" "}
                          <span className="font-medium text-gray-700">Привязанные устройства</span> →{" "}
                          <span className="font-medium text-gray-700">Привязать устройство</span> →{" "}
                          выберите <span className="font-medium text-gray-700">«Войти по номеру телефона»</span> и введите код:
                        </p>

                        <div className="relative inline-flex items-center gap-1 mb-2">
                          <div className="flex items-center gap-1 bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl px-5 py-3">
                            {pairingCode.split("").map((char, i) => (
                              <span
                                key={i}
                                className={`text-3xl font-mono font-bold tracking-widest ${char === "-" ? "text-gray-300 text-2xl" : "text-gray-900"}`}
                              >
                                {char}
                              </span>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => copyPairingCode(pairingCode)}
                            className="absolute -right-9 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            title="Копировать"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mb-4">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Ожидание подтверждения...
                        </div>

                        <div className="flex gap-2 justify-center">
                          <button
                            type="button"
                            onClick={() => { setPairingCode(null); setPairingError(null); }}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                          >
                            Другой номер
                          </button>
                          <button
                            type="button"
                            onClick={() => void requestPairingCode()}
                            disabled={pairingLoading}
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Новый код
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => { setConfigured(false); setPairingCode(null); setPairingError(null); setPairingPhone(""); setStatus(null); }}
                      className="mt-4 w-full text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      Изменить данные
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

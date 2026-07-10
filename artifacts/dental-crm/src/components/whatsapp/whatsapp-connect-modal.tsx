import { useState, useRef, useEffect, useCallback } from "react";
import { customFetch } from "@workspace/api-client-react";
import { CheckCircle2, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AppDialog } from "@/components/layout/app-dialog";

function extractApiErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
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

const BRAND = "#1f75fe";

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
  stateInstance?: string;
}

interface WaQr {
  type: string;
  message: string;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds} сек`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} мин ${s} сек`;
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

  // Steps: intro → phone (enter real number) → setup (auto-provision + QR)
  const [step, setStep] = useState<"intro" | "phone" | "setup">(
    forceSetup ? "phone" : startAtSetup ? "setup" : "intro"
  );

  // Phone step
  const [clinicPhone, setClinicPhone] = useState("");
  const [clinicPhoneSaving, setClinicPhoneSaving] = useState(false);

  // Provision state
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  // True after provision returns, while waiting for instance to initialize (up to 5 min)
  const [waitingForInit, setWaitingForInit] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // QR + status
  const [configured, setConfigured] = useState(false);
  const [qr, setQr] = useState<WaQr | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const qrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waitIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await customFetch<{ success: boolean; data: WaStatus }>(
        "/api/clinic/green-api/status",
      );
      setStatus(res.data);
      if (res.data.connected) {
        onConnected(res.data.phone);
      }
      return res.data;
    } catch {
      setStatus(null);
      return null;
    }
  }, [onConnected]);

  const fetchQr = useCallback(async () => {
    try {
      const res = await customFetch<{ success: boolean; data: WaQr }>(
        "/api/clinic/green-api/qr",
      );
      setQrError(null);
      setQr(res.data);
      if (res.data.type === "alreadyLogged") {
        await fetchStatus();
      }
    } catch (err) {
      setQr(null);
      setQrError(extractApiErrorMessage(err));
    }
  }, [fetchStatus]);

  // Silent QR probe — used during init polling. Returns true on success, false on any error.
  // Does NOT set qrError so the waiting-for-init UI stays clean.
  const probeQr = useCallback(async (): Promise<boolean> => {
    try {
      const res = await customFetch<{ success: boolean; data: WaQr }>(
        "/api/clinic/green-api/qr",
      );
      setQrError(null);
      setQr(res.data);
      if (res.data.type === "alreadyLogged") {
        await fetchStatus();
      }
      return true;
    } catch {
      // Instance may still be initializing on Green API side — keep waiting
      return false;
    }
  }, [fetchStatus]);

  // Poll status during "waitingForInit" phase — transition to QR once instance is ready
  const pollInitStatus = useCallback(async () => {
    const data = await fetchStatus();
    if (!data) return;

    const stop = () => {
      if (waitIntervalRef.current) clearInterval(waitIntervalRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      setWaitingForInit(false);
    };

    if (data.connected) {
      // Already authorized — skip QR phase
      stop();
      return;
    }
    if (data.stateInstance === "error") {
      // Auth failure — stop waiting and surface an error to the user
      stop();
      setProvisionError("Ошибка авторизации инстанса. Попробуйте создать заново или обратитесь в поддержку.");
      return;
    }
    if (data.stateInstance && data.stateInstance !== "initializing") {
      // State looks ready — but Green API may still be setting up the QR endpoint.
      // Probe QR silently; only transition if QR is actually available.
      const qrReady = await probeQr();
      if (qrReady) {
        stop();
        setConfigured(true);
      }
      // else: QR not ready yet — keep polling until it is or timeout fires
    }
    // else stateInstance === "initializing" → keep waiting
  }, [fetchStatus, probeQr]);

  // Start elapsed timer
  const startElapsedTimer = useCallback(() => {
    setElapsedSeconds(0);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1_000);
  }, []);

  // ── Initial load when modal opens at setup step ──
  useEffect(() => {
    if (!open) return;
    if (forceSetup) {
      setStep("setup");
      return;
    }
    if (startAtSetup) {
      setStep("setup");
      setInitialLoading(true);
      fetchStatus()
        .then(async data => {
          if (!data) return;
          if (data.connected) {
            // Already authorized — status polling will pick this up
          } else if (data.configured && data.stateInstance === "initializing") {
            // Instance exists but is still starting up — resume waiting UI
            setWaitingForInit(true);
            startElapsedTimer();
          } else if (data.configured) {
            // Instance ready — probe QR silently first before declaring configured
            const qrReady = await probeQr();
            if (qrReady) {
              setConfigured(true);
            } else {
              // QR not available yet — enter waiting mode
              setWaitingForInit(true);
              startElapsedTimer();
            }
          }
          // else: not configured → provision button shown (configured stays false)
        })
        .finally(() => setInitialLoading(false));
    }
  }, [open, startAtSetup, forceSetup, fetchQr, fetchStatus, startElapsedTimer, probeQr]);

  // ── QR + status polling once instance is configured ──
  useEffect(() => {
    if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    if (!configured || status?.connected) return;
    // Green API docs: poll QR every 2s so client always has the freshest QR
    qrIntervalRef.current = setInterval(fetchQr, 2_000);
    statusIntervalRef.current = setInterval(fetchStatus, 5_000);
    return () => {
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, [configured, status?.connected, fetchQr, fetchStatus]);

  // ── Waiting-for-init polling ──
  useEffect(() => {
    if (waitIntervalRef.current) clearInterval(waitIntervalRef.current);
    if (!waitingForInit) return;
    waitIntervalRef.current = setInterval(pollInitStatus, 5_000);
    return () => {
      if (waitIntervalRef.current) clearInterval(waitIntervalRef.current);
    };
  }, [waitingForInit, pollInitStatus]);

  // ── 5-minute hard timeout for initialization ──
  useEffect(() => {
    if (!waitingForInit) return;
    if (elapsedSeconds < 300) return;
    // Stop all timers and show timeout error
    if (waitIntervalRef.current) clearInterval(waitIntervalRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    setWaitingForInit(false);
    setProvisionError(
      "Инстанс не инициализировался за 5 минут. Возможно, произошла ошибка на стороне Green API. " +
      "Попробуйте нажать «Активировать WhatsApp» снова или обратитесь в поддержку."
    );
  }, [waitingForInit, elapsedSeconds]);

  // ── Reset on close ──
  useEffect(() => {
    if (!open) {
      setStep(forceSetup ? "phone" : startAtSetup ? "setup" : "intro");
      setClinicPhone("");
      setClinicPhoneSaving(false);
      setProvisioning(false);
      setProvisionError(null);
      setWaitingForInit(false);
      setElapsedSeconds(0);
      setConfigured(false);
      setQr(null);
      setQrError(null);
      setStatus(null);
      setInitialLoading(false);
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
      if (waitIntervalRef.current) clearInterval(waitIntervalRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
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

  const handleProvision = async () => {
    setProvisionError(null);
    setProvisioning(true);
    try {
      const res = await customFetch<{ success: boolean; data: { idInstance: string; isExisting: boolean } }>(
        "/api/clinic/green-api/provision",
        { method: "POST" },
      );
      if (res.data.isExisting) {
        // Instance already exists — check its current state before deciding next step
        const currentStatus = await fetchStatus();
        if (currentStatus?.connected) {
          // Already connected — status effect will update UI
        } else if (!currentStatus || currentStatus.stateInstance === "initializing") {
          // Still initializing — (re)enter waiting mode
          setWaitingForInit(true);
          startElapsedTimer();
          setTimeout(() => void pollInitStatus(), 3_000);
        } else {
          // State looks ready — but Green API may not have QR available yet.
          // Probe silently; if QR fails, fall back to waiting mode.
          const qrReady = await probeQr();
          if (qrReady) {
            setConfigured(true);
          } else {
            setWaitingForInit(true);
            startElapsedTimer();
            setTimeout(() => void pollInitStatus(), 3_000);
          }
        }
      } else {
        // New instance created — need to wait for initialization (up to 5 min)
        setWaitingForInit(true);
        startElapsedTimer();
        setTimeout(() => void pollInitStatus(), 3_000);
      }
    } catch (err) {
      setProvisionError(extractApiErrorMessage(err));
    } finally {
      setProvisioning(false);
    }
  };

  const isConnected = status?.connected && !forceSetup;

  const dialogTitle =
    step === "intro"
      ? "Подключите WhatsApp"
      : step === "phone"
        ? "Номер WhatsApp клиники"
        : initialLoading
          ? "Загрузка..."
          : isConnected
            ? "WhatsApp подключён"
            : waitingForInit
              ? "Инициализация инстанса..."
              : provisioning
                ? "Создание инстанса..."
                : configured
                  ? "Сканирование QR"
                  : "Подключение WhatsApp";

  const dialogDescription =
    step === "intro"
      ? "Подключите WhatsApp вашей клиники для сообщений пациентам"
      : step === "phone"
        ? "Шаг 1 из 2"
        : isConnected
          ? "Подключён"
          : step === "setup"
            ? "Шаг 2 из 2"
            : undefined;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (isConnected || step === "intro" || step === "phone" || (step === "setup" && !waitingForInit && !provisioning))) {
      onClose();
    }
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={
        step === "phone" || step === "setup" ? (
          <span className="flex items-center gap-2.5">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#25D366" + "20" }}
            >
              <WhatsAppIcon size={20} color="#25D366" />
            </span>
            {dialogTitle}
          </span>
        ) : (
          dialogTitle
        )
      }
      description={dialogDescription}
      size="md"
      showClose={
        step === "intro" ||
        step === "phone" ||
        (step === "setup" && !waitingForInit && !provisioning && !initialLoading)
      }
    >
      {/* ── Intro ── */}
      {step === "intro" && (
        <div className="flex flex-col items-center text-center -mt-1">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg mb-5"
            style={{ backgroundColor: "#25D366" + "20" }}
          >
            <WhatsAppIcon size={46} color="#25D366" />
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            Подключите WhatsApp вашей клиники, чтобы отправлять сообщения пациентам,
            напоминания и постоперационные уведомления прямо из CRM.
          </p>
          <div className="w-full space-y-3 text-left mb-7">
            {[
              "Укажите номер WhatsApp вашей клиники",
              "Инстанс создаётся автоматически — вручную ничего вводить не нужно",
              "Отсканируйте QR-код на телефоне клиники",
            ].map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white mt-0.5"
                  style={{ backgroundColor: BRAND }}
                >
                  {i + 1}
                </div>
                <p className="text-sm text-muted-foreground">{s}</p>
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

      {/* ── Phone step ── */}
      {step === "phone" && (
        <div>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Введите номер телефона, на котором работает WhatsApp вашей клиники. Он будет использоваться для реферальных ссылок и отображения в CRM.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Номер WhatsApp (международный формат)
              </label>
              <input
                type="tel"
                value={clinicPhone}
                onChange={e => setClinicPhone(e.target.value)}
                placeholder="77071234567"
                className="w-full h-10 rounded-lg border border-border bg-white px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/30"
                onKeyDown={e => { if (e.key === "Enter") void handleClinicPhoneSave(); }}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">
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

      {/* ── Setup step ── */}
      {step === "setup" && (
        <div>
          {/* Loading initial state */}
          {initialLoading && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Проверка статуса...</p>
            </div>
          )}

          {/* Connected success */}
          {!initialLoading && isConnected && (
            <div className="text-center py-4">
              <CheckCircle2 className="w-14 h-14 mx-auto mb-3 text-green-500" />
              <p className="font-semibold text-foreground text-base mb-1">WhatsApp успешно подключён!</p>
              {status?.phone && (
                <p className="text-sm text-muted-foreground">
                  Номер <span className="font-mono font-semibold text-foreground">+{status.phone}</span>{" "}
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
          )}

          {/* Provisioning spinner */}
          {!initialLoading && !isConnected && provisioning && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#25D366" + "18" }}>
                <WhatsAppIcon size={36} color="#25D366" />
              </div>
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: BRAND }} />
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Создаём инстанс в Green API</p>
                <p className="text-xs text-muted-foreground mt-1">Обычно занимает несколько секунд...</p>
              </div>
            </div>
          )}

          {/* Waiting for initialization */}
          {!initialLoading && !isConnected && !provisioning && waitingForInit && (
            <div className="flex flex-col items-center py-6 gap-4 text-center">
              <div className="relative">
                <div
                  className="w-20 h-20 rounded-3xl flex items-center justify-center"
                  style={{ backgroundColor: "#25D366" + "15" }}
                >
                  <WhatsAppIcon size={40} color="#25D366" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white flex items-center justify-center shadow">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: BRAND }} />
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Инстанс создан, ожидаем готовности</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-xs">
                  Инициализация занимает до 5 минут. Пожалуйста, не закрывайте это окно.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-[#faf8f4] rounded-lg px-4 py-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Прошло: {formatElapsed(elapsedSeconds)}</span>
              </div>
            </div>
          )}

          {/* Provision button + error */}
          {!initialLoading && !isConnected && !provisioning && !waitingForInit && !configured && (
            <div className="flex flex-col gap-4">
              <div className="bg-[#faf8f4] rounded-xl p-4 text-sm text-muted-foreground leading-relaxed">
                Нажмите кнопку ниже — система автоматически создаст WhatsApp инстанс
                и покажет QR-код для сканирования с телефона клиники.
              </div>

              {provisionError && (
                <div className="flex items-start gap-2.5 bg-red-50 rounded-xl p-3 text-xs text-red-600">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{provisionError}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleProvision()}
                className="w-full h-11 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ backgroundColor: "#25D366" }}
              >
                <WhatsAppIcon size={18} color="white" />
                Активировать WhatsApp
              </button>
            </div>
          )}

          {/* QR section */}
          {!initialLoading && !isConnected && configured && (
            <>
              {!qr && !qrError && (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Запрашиваем QR-код у Green API...</p>
                </div>
              )}

              {!qr && qrError && (
                <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">Не удалось получить QR-код</p>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">{qrError}</p>
                  </div>
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
              )}

              {qr && (
                <div className="text-center">
                  {qr.type === "qrCode" ? (
                    <>
                      <p className="text-xs text-muted-foreground mb-3">
                        Отсканируйте QR с телефона → WhatsApp → Привязанные устройства
                      </p>
                      <div className="flex justify-center mb-3">
                        <img
                          src={`data:image/png;base64,${qr.message}`}
                          alt="WhatsApp QR"
                          className="w-48 h-48 rounded-xl border border-border shadow-sm"
                        />
                      </div>
                      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Ожидание сканирования...
                      </div>
                    </>
                  ) : qr.type === "alreadyLogged" ? (
                    <div className="py-2">
                      <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
                      <p className="text-sm font-semibold text-foreground">WhatsApp уже подключён</p>
                    </div>
                  ) : (
                    <div className="py-2">
                      <p className="text-sm text-muted-foreground">{qr.type}: {qr.message}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </AppDialog>
  );
}

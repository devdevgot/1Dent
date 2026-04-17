import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPatients,
  useListMessages,
  useSendMessage,
  getListPatientsQueryKey,
  getListMessagesQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import type { Patient, Message } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import {
  AlertTriangle,
  Send,
  MessageSquare,
  Search,
  Check,
  CheckCheck,
  Clock,
  XCircle,
  ChevronLeft,
  Pencil,
  X,
  Copy,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";

const BRAND      = "#98cc1c";
const BRAND_DARK = "#1a2204";
const CHAT_BG    = "#ECE5DD";

const DOT_PATTERN = `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1' fill='%23b2a898' fill-opacity='0.22'/%3E%3C/svg%3E")`;

const WA_ICON_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z";

function WhatsAppIcon({ size = 16, color = "#25D366" }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ flexShrink: 0 }} fill={color}>
      <path d={WA_ICON_PATH} />
    </svg>
  );
}

const AVATAR_COLORS = [
  { bg: "#fde68a", text: "#92400e" },
  { bg: "#bbf7d0", text: "#14532d" },
  { bg: "#bfdbfe", text: "#1e3a8a" },
  { bg: "#f9a8d4", text: "#831843" },
  { bg: "#c4b5fd", text: "#3b0764" },
  { bg: "#fed7aa", text: "#7c2d12" },
  { bg: "#a5f3fc", text: "#164e63" },
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const { bg, text } = getAvatarColor(name);
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-bold shadow-sm"
      style={{ width: size, height: size, backgroundColor: bg, color: text, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

function useChatDateLabel() {
  const { t } = useTranslation();
  return (dateStr: string): string => {
    const d         = new Date(dateStr);
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString())     return t("chat.today");
    if (d.toDateString() === yesterday.toDateString()) return t("chat.yesterday");
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });
  };
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

type DeliveryStatus = "pending" | "sent" | "delivered" | "failed";

function DeliveryIcon({ status }: { status: DeliveryStatus }) {
  if (status === "pending")   return <Clock      className="w-3 h-3 inline ml-0.5 opacity-60" />;
  if (status === "sent")      return <Check      className="w-3 h-3 inline ml-0.5 opacity-80" />;
  if (status === "delivered") return <CheckCheck className="w-3 h-3 inline ml-0.5 opacity-90" />;
  if (status === "failed")    return <XCircle    className="w-3 h-3 inline ml-0.5 text-red-300" />;
  return null;
}

function getDeliveryStatus(message: Message): DeliveryStatus {
  if (message.id.startsWith("optimistic-")) return "pending";
  if (message.direction === "outbound")
    return message.whatsappMessageId ? "delivered" : "sent";
  return "delivered";
}

function BubbleTailOut() {
  return (
    <span
      style={{
        position: "absolute",
        top: 0,
        right: -6,
        width: 0,
        height: 0,
        borderTop: `8px solid ${BRAND}`,
        borderLeft: "6px solid transparent",
      }}
    />
  );
}

function BubbleTailIn({ alert }: { alert?: boolean }) {
  const color = alert ? "#fef2f2" : "#ffffff";
  return (
    <span
      style={{
        position: "absolute",
        top: 0,
        left: -6,
        width: 0,
        height: 0,
        borderTop: `8px solid ${color}`,
        borderRight: "6px solid transparent",
      }}
    />
  );
}

function MessageBubble({ message, isOutbound }: { message: Message; isOutbound: boolean }) {
  const { t }            = useTranslation();
  const deliveryStatus   = getDeliveryStatus(message);
  const isAlert          = message.isRedAlert;

  return (
    <div className={cn("flex mb-1 px-3", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[76%] px-3.5 py-2 shadow-sm",
          isOutbound ? "rounded-2xl rounded-tr-none" : "rounded-2xl rounded-tl-none",
          isAlert && !isOutbound && "border border-red-300",
        )}
        style={
          isOutbound
            ? { backgroundColor: BRAND, color: BRAND_DARK }
            : isAlert
            ? { backgroundColor: "#fef2f2", color: "#1f2937" }
            : { backgroundColor: "#ffffff", color: "#1f2937" }
        }
      >
        {isOutbound ? <BubbleTailOut /> : <BubbleTailIn alert={isAlert} />}
        {isAlert && (
          <div className="flex items-center gap-1 text-red-600 mb-1 text-xs font-semibold">
            <AlertTriangle className="w-3 h-3" />
            <span>{t("chat.redAlert")}</span>
          </div>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
        <div
          className={cn(
            "flex items-center justify-end gap-0.5 mt-0.5 text-[10px] select-none",
            isOutbound ? "opacity-60" : "text-gray-400",
          )}
        >
          <span>{formatTime(message.createdAt)}</span>
          {isAlert && isOutbound && <span>🚨</span>}
          {isOutbound && <DeliveryIcon status={deliveryStatus} />}
        </div>
      </div>
    </div>
  );
}

function ChatPanel({ patient, onBack }: { patient: Patient; onBack?: () => void }) {
  const { t }           = useTranslation();
  const { user }        = useAuthStore();
  const [text, setText] = useState("");
  const bottomRef       = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const qc              = useQueryClient();
  const formatDate      = useChatDateLabel();

  const { data, isLoading } = useListMessages(patient.id, {
    query: {
      queryKey: getListMessagesQueryKey(patient.id),
      refetchInterval: 5000,
    },
  });

  const sendMutation = useSendMessage({
    mutation: {
      onMutate: async (vars) => {
        const optimistic: Message = {
          id:               `optimistic-${Date.now()}`,
          clinicId:         user!.clinicId,
          patientId:        patient.id,
          direction:        "outbound",
          senderId:         user!.id,
          content:          vars.data.content,
          whatsappMessageId: null,
          isRedAlert:       false,
          createdAt:        new Date().toISOString(),
        };
        qc.setQueryData(getListMessagesQueryKey(patient.id), (old: typeof data) => {
          if (!old?.data?.messages) return old;
          return { ...old, data: { messages: [...old.data.messages, optimistic] } };
        });
        return { optimistic };
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListMessagesQueryKey(patient.id) });
      },
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.data?.messages?.length]);

  const messages = data?.data?.messages ?? [];

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    sendMutation.mutate({ patientId: patient.id, data: { content: trimmed } });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const grouped: { date: string; messages: Message[] }[] = [];
  for (const msg of messages) {
    const d    = formatDate(msg.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last.date === d) last.messages.push(msg);
    else grouped.push({ date: d, messages: [msg] });
  }

  const hasRedAlert = messages.some((m) => m.isRedAlert);

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border/30 shrink-0"
        style={{ background: "linear-gradient(135deg,#ffffff 0%,#f8fdf0 100%)" }}
      >
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden p-1.5 -ml-1 rounded-xl hover:bg-slate-100 text-muted-foreground transition-colors"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <Avatar name={patient.name} size={44} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="font-bold text-[15px] text-foreground truncate">{patient.name}</p>
            <WhatsAppIcon size={15} />
          </div>
          <p className="text-xs text-muted-foreground truncate">{patient.phone}</p>
        </div>

        {hasRedAlert && (
          <Badge variant="destructive" className="flex items-center gap-1 shrink-0 text-xs">
            <AlertTriangle className="w-3 h-3" />
            {t("chat.redAlert")}
          </Badge>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto py-3"
        style={{ backgroundColor: CHAT_BG, backgroundImage: DOT_PATTERN }}
      >
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="bg-white/80 rounded-2xl px-5 py-3 text-sm text-muted-foreground shadow-sm">
              {t("chat.loadingMessages")}
            </div>
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-md"
              style={{ backgroundColor: BRAND + "25" }}
            >
              <WhatsAppIcon size={34} color={BRAND} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600">{t("chat.noMessages")}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t("chat.startConversation")}</p>
            </div>
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.date}>
            <div className="flex justify-center my-3 px-4">
              <span className="text-[11px] font-medium bg-white/80 text-gray-500 px-3 py-1 rounded-full shadow-sm backdrop-blur-sm">
                {group.date}
              </span>
            </div>
            {group.messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOutbound={msg.direction === "outbound"}
              />
            ))}
          </div>
        ))}

        <div ref={bottomRef} className="h-2" />
      </div>

      <div className="flex items-end gap-2.5 px-3 py-2.5 border-t border-border/30 shrink-0 bg-[#f0f2f5]">
        <div className="flex-1 bg-white rounded-2xl px-3.5 py-2 shadow-sm border border-border/20 flex items-end min-h-[44px]">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={t("chat.messagePlaceholder")}
            rows={1}
            className="w-full resize-none outline-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground leading-relaxed"
            style={{ maxHeight: 120, minHeight: 24 }}
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!text.trim() || sendMutation.isPending}
          className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:opacity-40 shadow-md"
          style={{ backgroundColor: BRAND }}
        >
          <Send className="w-4 h-4" style={{ color: BRAND_DARK }} />
        </button>
      </div>
    </div>
  );
}

interface WaStatus {
  configured: boolean;
  connected: boolean;
  phone: string | null;
}

interface WaQr {
  type: string;
  message: string;
}

function WhatsAppConnectModal({
  open,
  onClose,
  onConnected,
  startAtSetup,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: (phone: string | null) => void;
  startAtSetup?: boolean;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<"intro" | "setup">(startAtSetup ? "setup" : "intro");
  const [instanceId, setInstanceId] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [qr, setQr] = useState<WaQr | null>(null);
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [copied, setCopied] = useState(false);
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
      setQr(res.data);
      setConfigured(true);
      if (res.data.type === "alreadyLogged") {
        await fetchStatus();
      }
    } catch {
      setQr(null);
    }
  }, [fetchStatus]);

  useEffect(() => {
    if (!open) return;
    if (startAtSetup) {
      setStep("setup");
      fetchQr();
      fetchStatus();
    }
  }, [open, startAtSetup, fetchQr, fetchStatus]);

  useEffect(() => {
    if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);

    if (!configured || status?.connected) return;

    qrIntervalRef.current = setInterval(fetchQr, 20_000);
    statusIntervalRef.current = setInterval(fetchStatus, 10_000);

    return () => {
      if (qrIntervalRef.current) clearInterval(qrIntervalRef.current);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, [configured, status?.connected, fetchQr, fetchStatus]);

  useEffect(() => {
    if (!open) {
      setStep(startAtSetup ? "setup" : "intro");
      setInstanceId("");
      setToken("");
      setSaving(false);
      setConfigured(false);
      setQr(null);
      setStatus(null);
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
      toast({ title: "Данные сохранены. Сканируйте QR-код." });
      await fetchQr();
      await fetchStatus();
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

  if (!open) return null;

  const isConnected = status?.connected;

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
                "Отсканируйте QR-код с телефона клиники",
                "Номер автоматически добавится в каналы",
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white mt-0.5"
                    style={{ backgroundColor: BRAND }}
                  >
                    {i + 1}
                  </div>
                  <p className="text-sm text-gray-600">{step}</p>
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
                  {isConnected ? "WhatsApp подключён" : "Настройка WhatsApp"}
                </h2>
                <p className="text-xs text-gray-400">Green API</p>
              </div>
            </div>

            {isConnected ? (
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
                      {saving ? "Сохранение..." : "Сохранить и получить QR"}
                    </button>
                  </form>
                )}

                {configured && qr && (
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
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { t }                                   = useTranslation();
  const { user, clinic, setAuth }               = useAuthStore();
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [search, setSearch]                     = useState("");
  const [waStatus, setWaStatus]                 = useState<WaStatus | null>(null);
  const [waStatusLoading, setWaStatusLoading]   = useState(true);
  const [modalOpen, setModalOpen]               = useState(false);
  const [modalAtSetup, setModalAtSetup]         = useState(false);

  const isOwner = user?.role === "owner";

  const fetchWaStatus = useCallback(async () => {
    try {
      const res = await customFetch<{ success: boolean; data: WaStatus }>(
        "/api/clinic/green-api/status",
      );
      setWaStatus(res.data);
      if (!res.data.configured && isOwner) {
        setModalOpen(true);
        setModalAtSetup(false);
      }
    } catch {
      setWaStatus(null);
    } finally {
      setWaStatusLoading(false);
    }
  }, [isOwner]);

  useEffect(() => {
    fetchWaStatus();
  }, [fetchWaStatus]);

  const handleConnected = useCallback(async (phone: string | null) => {
    if (phone && clinic && user) {
      try {
        await customFetch("/api/clinic/whatsapp-phone", {
          method: "PATCH",
          body: JSON.stringify({ whatsappPhone: phone }),
        });
        const meRes = await customFetch<{ success: boolean; data: { user: typeof user; clinic: typeof clinic } }>(
          "/api/auth/me",
        );
        if (meRes.data) setAuth(meRes.data.user, meRes.data.clinic);
      } catch {
      }
    }
    setWaStatus({ configured: true, connected: true, phone });
  }, [clinic, user, setAuth]);

  const handleOpenChangeModal = () => {
    setModalAtSetup(true);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    fetchWaStatus();
  };

  const { data } = useListPatients({
    query: { queryKey: getListPatientsQueryKey() },
  });

  const patients        = data?.data?.patients ?? [];
  const filtered        = patients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const handleBack      = () => setSelectedPatientId(null);

  const waConnected = waStatus?.connected ?? false;
  const waConfigured = waStatus?.configured ?? false;

  return (
    <div className="flex overflow-hidden h-full">
      <aside
        className={cn(
          "flex flex-col border-r border-border/40",
          "w-full md:w-80 md:shrink-0",
          selectedPatientId ? "hidden md:flex" : "flex",
        )}
        style={{ background: "linear-gradient(180deg,#ffffff 0%,#f9fdf2 100%)" }}
      >
        <div className="px-4 pt-4 pb-3 border-b border-border/40">
          <div className="flex items-center gap-2 mb-3">
            <WhatsAppIcon size={18} />
            <h2 className="font-bold text-[15px] text-foreground flex-1">{t("chat.title")}</h2>
            {isOwner && (waConnected || waConfigured) && (
              <button
                onClick={handleOpenChangeModal}
                title="Изменить WhatsApp"
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
              >
                <Pencil className="w-3 h-3" />
                <span>Изменить</span>
              </button>
            )}
          </div>

          {!waStatusLoading && !waConnected && !isOwner && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
              <p className="text-xs text-amber-700 leading-relaxed">
                WhatsApp не подключён. Обратитесь к Владельцу клиники, чтобы он подключил WhatsApp.
              </p>
            </div>
          )}

          {!waStatusLoading && waConnected && waStatus?.phone && (
            <div className="flex items-center gap-1.5 mb-3 px-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <p className="text-xs text-gray-500 font-mono">+{waStatus.phone}</p>
            </div>
          )}

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("chat.searchPlaceholder")}
              className="w-full pl-9 pr-4 py-2.5 bg-white/80 border border-border/40 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#98cc1c]/40 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-8 text-center">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{t("chat.noPatients")}</p>
            </div>
          )}
          {filtered.map((patient) => (
            <PatientListItem
              key={patient.id}
              patient={patient}
              isSelected={patient.id === selectedPatientId}
              onSelect={() => setSelectedPatientId(patient.id)}
            />
          ))}
        </div>
      </aside>

      <main
        className={cn(
          "flex-1 flex flex-col",
          selectedPatientId ? "flex" : "hidden md:flex",
        )}
      >
        {selectedPatient ? (
          <ChatPanel patient={selectedPatient} onBack={handleBack} />
        ) : (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center"
            style={{ backgroundColor: CHAT_BG, backgroundImage: DOT_PATTERN }}
          >
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg"
              style={{ backgroundColor: BRAND + "25" }}
            >
              <WhatsAppIcon size={44} color={BRAND} />
            </div>
            <div>
              <p className="font-semibold text-gray-700 text-base">{t("chat.selectPatient")}</p>
              <p className="text-sm text-gray-400 mt-1">{t("chat.selectPatientHint")}</p>
            </div>
          </div>
        )}
      </main>

      {isOwner && (
        <WhatsAppConnectModal
          open={modalOpen}
          onClose={handleModalClose}
          onConnected={handleConnected}
          startAtSetup={modalAtSetup}
        />
      )}
    </div>
  );
}

function PatientListItem({
  patient,
  isSelected,
  onSelect,
}: {
  patient: Patient;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { bg, text } = getAvatarColor(patient.name);
  const initials = patient.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all border-b border-border/20",
        isSelected
          ? "bg-[#f2fbea] border-l-[3px]"
          : "hover:bg-white/70 border-l-[3px] border-l-transparent",
      )}
      style={isSelected ? { borderLeftColor: BRAND } : undefined}
    >
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 font-bold text-sm shadow-sm"
        style={{ backgroundColor: bg, color: text }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("font-semibold text-sm truncate", isSelected ? "text-[#1a2204]" : "text-foreground")}>
          {patient.name}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{patient.phone}</p>
      </div>
      {isSelected && (
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: BRAND }} />
      )}
    </button>
  );
}

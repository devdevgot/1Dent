import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
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
  CheckCheck,
  Clock,
  XCircle,
  ChevronLeft,
  Pencil,
  X,
  Loader2,
  PlayCircle,
  StopCircle,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { WhatsAppConnectModal, WhatsAppIcon, type WaStatus } from "@/components/whatsapp/whatsapp-connect-modal";

const BRAND      = "#98cc1c";
const BRAND_DARK = "#1a2204";
const CHAT_BG    = "#ECE5DD";

const DOT_PATTERN = `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1' fill='%23b2a898' fill-opacity='0.22'/%3E%3C/svg%3E")`;

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

interface ChatSessionData {
  id: string;
  patientId: string;
  clinicId: string;
  startedById: string;
  startedAt: string;
  endedById: string | null;
  endedAt: string | null;
  startedByName: string | null;
  endedByName: string | null;
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

  const [session, setSession]         = useState<ChatSessionData | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionHistory, setSessionHistory] = useState<ChatSessionData[]>([]);
  const [sessionWorking, setSessionWorking] = useState(false);

  const fetchSession = useCallback(async () => {
    try {
      const res = await customFetch<{
        success: boolean;
        data: { session: ChatSessionData | null; history: ChatSessionData[] };
      }>(`/api/patients/${patient.id}/chat-session`);
      setSession(res.data.session);
      setSessionHistory(res.data.history);
    } catch {
      // ignore
    } finally {
      setSessionLoading(false);
    }
  }, [patient.id]);

  useEffect(() => {
    setSession(null);
    setSessionHistory([]);
    setSessionLoading(true);
    fetchSession();
    const iv = setInterval(fetchSession, 10_000);
    return () => clearInterval(iv);
  }, [patient.id, fetchSession]);

  const handleStartSession = async () => {
    setSessionWorking(true);
    try {
      const res = await customFetch<{ success: boolean; data: { session: ChatSessionData } }>(
        `/api/patients/${patient.id}/chat-session`,
        { method: "POST" },
      );
      setSession(res.data.session);
    } catch {
      // ignore
    } finally {
      setSessionWorking(false);
    }
  };

  const handleEndSession = async () => {
    setSessionWorking(true);
    try {
      await customFetch(`/api/patients/${patient.id}/chat-session/end`, { method: "POST" });
      await fetchSession();
    } catch {
      // ignore
    } finally {
      setSessionWorking(false);
    }
  };

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

      {/* Session banner */}
      {!sessionLoading && (
        <div className="shrink-0 border-b border-border/20">
          {session ? (
            <div className="flex items-center gap-2.5 px-4 py-2" style={{ backgroundColor: "#f0fdf4" }}>
              <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-green-800 font-medium leading-snug truncate">
                  Чат начат: <span className="font-semibold">{session.startedByName ?? "—"}</span>
                  {" · "}{formatDateTime(session.startedAt)}
                </p>
              </div>
              <button
                onClick={handleEndSession}
                disabled={sessionWorking}
                className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50 transition-colors disabled:opacity-50 shrink-0"
              >
                {sessionWorking ? <Loader2 className="w-3 h-3 animate-spin" /> : <StopCircle className="w-3 h-3" />}
                Завершить чат
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-4 py-2 bg-gray-50">
              {sessionHistory.length > 0 && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 truncate">
                    <UserCheck className="w-3 h-3 inline mr-1" />
                    Последний чат завершён:{" "}
                    <span className="font-medium text-gray-500">
                      {sessionHistory[sessionHistory.length - 1]!.endedByName ?? sessionHistory[sessionHistory.length - 1]!.startedByName ?? "—"}
                    </span>
                    {sessionHistory[sessionHistory.length - 1]!.endedAt && (
                      <> · {formatDateTime(sessionHistory[sessionHistory.length - 1]!.endedAt!)}</>
                    )}
                  </p>
                </div>
              )}
              {sessionHistory.length === 0 && <div className="flex-1" />}
              <button
                onClick={handleStartSession}
                disabled={sessionWorking}
                className="flex items-center gap-1 text-xs font-semibold shrink-0 px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50"
                style={{ color: BRAND_DARK, borderColor: BRAND, backgroundColor: BRAND + "15" }}
              >
                {sessionWorking ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                Начать чат
              </button>
            </div>
          )}
        </div>
      )}

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
      // Open modal if not configured at all, OR if configured but device was removed (not connected).
      // Use functional updater so we don't re-trigger setModalAtSetup if modal is already open.
      if (isOwner && (!res.data.configured || !res.data.connected)) {
        setModalOpen((already) => {
          if (!already) setModalAtSetup(false);
          return true;
        });
      }
    } catch {
      setWaStatus(null);
    } finally {
      setWaStatusLoading(false);
    }
  }, [isOwner]);

  useEffect(() => {
    fetchWaStatus();
    // Poll every 30 seconds so disconnection is detected while staying on chat page
    const iv = setInterval(fetchWaStatus, 30_000);
    return () => clearInterval(iv);
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

  const [, setLocation] = useLocation();

  const handleModalClose = () => {
    setModalOpen(false);
    // If user manually opened the modal via "Изменить" (modalAtSetup=true), just dismiss and stay.
    // Otherwise (modal was auto-opened because WA is not connected), redirect to dashboard.
    if (!modalAtSetup && !waStatus?.connected) {
      setLocation(getRoleDashboardPath(user?.role ?? "owner"));
    } else {
      fetchWaStatus();
    }
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

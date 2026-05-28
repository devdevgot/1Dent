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
  Check,
  CheckCheck,
  Clock,
  XCircle,
  ChevronLeft,
  Pencil,
  Loader2,
  PlayCircle,
  StopCircle,
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

// ── Timeline types ────────────────────────────────────────────────────────────
type TimelineItem =
  | { kind: "message"; ts: string; msg: Message }
  | { kind: "session_start"; ts: string; name: string | null }
  | { kind: "session_end"; ts: string; name: string | null };

function buildTimeline(messages: Message[], sessions: ChatSessionData[]): TimelineItem[] {
  const items: TimelineItem[] = messages.map((m) => ({ kind: "message", ts: m.createdAt, msg: m }));
  for (const s of sessions) {
    items.push({ kind: "session_start", ts: s.startedAt, name: s.startedByName });
    if (s.endedAt) {
      items.push({ kind: "session_end", ts: s.endedAt, name: s.endedByName });
    }
  }
  items.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  return items;
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
        {isOutbound && message.senderId === null && (
          <div className="text-[10px] opacity-60 mb-0.5 font-medium">🤖 Бот</div>
        )}
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

function SessionEventBubble({ kind, ts, name }: { kind: "session_start" | "session_end"; ts: string; name: string | null }) {
  const isStart = kind === "session_start";
  return (
    <div className="flex justify-center my-2 px-4">
      <div
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-full shadow-sm",
          isStart
            ? "bg-green-100 text-green-700 border border-green-200"
            : "bg-red-50 text-red-600 border border-red-200",
        )}
      >
        {isStart ? (
          <PlayCircle className="w-3 h-3 shrink-0" />
        ) : (
          <StopCircle className="w-3 h-3 shrink-0" />
        )}
        <span>
          {isStart ? "Сотрудник" : "Сотрудник"}
          {name ? <> <strong>{name}</strong></> : null}
          {" "}{isStart ? "начал диалог" : "завершил диалог"}
        </span>
        <span className="opacity-50">·</span>
        <span className="opacity-70">{formatTime(ts)}</span>
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

  const [session, setSession]               = useState<ChatSessionData | null>(null);
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
      await fetchSession();
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

  // Build unified timeline: messages + session start/end events merged by timestamp
  const timeline = buildTimeline(messages, sessionHistory);

  // Group timeline by date
  const grouped: { date: string; items: TimelineItem[] }[] = [];
  for (const item of timeline) {
    const d    = formatDate(item.ts);
    const last = grouped[grouped.length - 1];
    if (last && last.date === d) last.items.push(item);
    else grouped.push({ date: d, items: [item] });
  }

  const hasRedAlert = messages.some((m) => m.isRedAlert);

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
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

        {/* Active session indicator in header */}
        {!sessionLoading && session && (
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-green-700 font-medium hidden sm:inline">Чат активен</span>
          </div>
        )}

        {hasRedAlert && (
          <Badge variant="destructive" className="flex items-center gap-1 shrink-0 text-xs">
            <AlertTriangle className="w-3 h-3" />
            {t("chat.redAlert")}
          </Badge>
        )}
      </div>

      {/* ── Message feed ── */}
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

        {!isLoading && messages.length === 0 && sessionHistory.length === 0 && (
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
            {group.items.map((item, idx) => {
              if (item.kind === "message") {
                return (
                  <MessageBubble
                    key={item.msg.id}
                    message={item.msg}
                    isOutbound={item.msg.direction === "outbound"}
                  />
                );
              }
              return (
                <SessionEventBubble
                  key={`${item.kind}-${idx}`}
                  kind={item.kind}
                  ts={item.ts}
                  name={item.name}
                />
              );
            })}
          </div>
        ))}

        <div ref={bottomRef} className="h-2" />
      </div>

      {/* ── Input area with Start/End buttons ── */}
      {!sessionLoading && !session ? (
        // No active session — show "Начать диалог" button
        <div className="px-3 py-2.5 border-t border-border/30 shrink-0 bg-[#f0f2f5]">
          <button
            onClick={handleStartSession}
            disabled={sessionWorking}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-60 shadow-sm"
            style={{ backgroundColor: BRAND, color: BRAND_DARK }}
          >
            {sessionWorking
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <PlayCircle className="w-4 h-4" />
            }
            {sessionWorking ? "Начинаем…" : "Начать диалог"}
          </button>
        </div>
      ) : (
        // Active session (or still loading) — show full input with "Завершить" on left
        <div className="flex flex-col gap-0 border-t border-border/30 shrink-0 bg-[#f0f2f5]">
          <div className="flex items-end gap-2 px-3 py-2.5">
            {/* Завершить button on the left */}
            {!sessionLoading && session && (
              <button
                onClick={handleEndSession}
                disabled={sessionWorking}
                title="Завершить диалог"
                className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 rounded-xl px-2.5 py-2 hover:bg-red-50 transition-colors disabled:opacity-50 shrink-0 self-end mb-0.5"
              >
                {sessionWorking
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <StopCircle className="w-3.5 h-3.5" />
                }
                <span className="hidden sm:inline">Завершить</span>
              </button>
            )}

            {/* Message textarea */}
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

            {/* Send button */}
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
      )}
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
  const [activePatientIds, setActivePatientIds] = useState<Set<string>>(new Set());

  const isOwner = user?.role === "owner";

  // Fetch active sessions to sort the patient list
  const fetchActiveSessions = useCallback(async () => {
    try {
      const res = await customFetch<{ success: boolean; data: { activePatientIds: string[] } }>(
        "/api/chat-sessions/active",
      );
      setActivePatientIds(new Set(res.data.activePatientIds));
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchActiveSessions();
    const iv = setInterval(fetchActiveSessions, 15_000);
    return () => clearInterval(iv);
  }, [fetchActiveSessions]);

  const fetchWaStatus = useCallback(async () => {
    try {
      const res = await customFetch<{ success: boolean; data: WaStatus }>(
        "/api/clinic/green-api/status",
      );
      setWaStatus(res.data);
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
    if (!modalAtSetup && !waStatus?.connected) {
      setLocation(getRoleDashboardPath(user?.role ?? "owner"));
    } else {
      fetchWaStatus();
    }
  };

  const { data, isLoading: patientsLoading } = useListPatients({
    query: { queryKey: getListPatientsQueryKey() },
  });

  const patients = data?.data?.patients ?? [];

  // Sort: active sessions first, then alphabetically
  const sortedPatients = [...patients].sort((a, b) => {
    const aActive = activePatientIds.has(a.id) ? 0 : 1;
    const bActive = activePatientIds.has(b.id) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return a.name.localeCompare(b.name, "ru");
  });

  const filtered = sortedPatients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const handleBack      = () => setSelectedPatientId(null);

  const waConnected  = waStatus?.connected ?? false;
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
          {patientsLoading && (
            <div className="p-3 space-y-2">
              {[0,1,2,3,4].map(i => (
                <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          )}
          {!patientsLoading && filtered.length === 0 && (
            <div className="p-8 text-center">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{t("chat.noPatients")}</p>
            </div>
          )}
          {!patientsLoading && filtered.map((patient) => (
            <PatientListItem
              key={patient.id}
              patient={patient}
              isSelected={patient.id === selectedPatientId}
              isActive={activePatientIds.has(patient.id)}
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
  isActive,
  onSelect,
}: {
  patient: Patient;
  isSelected: boolean;
  isActive: boolean;
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
      <div className="relative shrink-0">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shadow-sm"
          style={{ backgroundColor: bg, color: text }}
        >
          {initials}
        </div>
        {/* Active session indicator dot */}
        {isActive && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white"
            style={{ backgroundColor: "#22c55e" }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={cn("font-semibold text-sm truncate", isSelected ? "text-[#1a2204]" : "text-foreground")}>
            {patient.name}
          </p>
          {isActive && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ backgroundColor: BRAND + "30", color: BRAND_DARK }}>
              активен
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{patient.phone}</p>
      </div>
      {isSelected && (
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: BRAND }} />
      )}
    </button>
  );
}

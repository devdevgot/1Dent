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
  Pencil,
  Loader2,
  Paperclip,
  PlayCircle,
  StopCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { WhatsAppConnectModal, WhatsAppIcon, type WaStatus } from "@/components/whatsapp/whatsapp-connect-modal";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ChatMessagesSkeleton } from "@/components/skeletons";
import { toast } from "sonner";

const BRAND      = "#1f75fe";
const CHAT_BG    = "#faf8f4";

const DOT_PATTERN = `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1' fill='%23d4cfc6' fill-opacity='0.35'/%3E%3C/svg%3E")`;

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
  const safeName = name || "User";
  const { bg, text } = getAvatarColor(safeName);
  const initials = safeName
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
  if (status === "failed")    return <XCircle    className="w-3 h-3 inline ml-0.5 text-[#fca5a5]" />;
  return null;
}

const ATTACHMENT_PREFIX = "__file__:";

interface ParsedAttachment {
  caption?: string;
  objectPath: string;
  fileName: string;
  contentType: string;
}

function parseAttachmentContent(content: string): ParsedAttachment | null {
  const metaLine =
    content
      .split("\n")
      .find((line) => line.startsWith(ATTACHMENT_PREFIX)) ??
    (content.startsWith(ATTACHMENT_PREFIX) ? content : null);
  if (!metaLine) return null;

  const parts = metaLine.slice(ATTACHMENT_PREFIX.length).split("|");
  if (parts.length < 3) return null;

  const [objectPath, fileName, contentType] = parts as [string, string, string];
  const caption = content
    .split("\n")
    .filter((line) => !line.startsWith(ATTACHMENT_PREFIX))
    .join("\n")
    .trim();

  return {
    objectPath,
    fileName,
    contentType,
    caption: caption || undefined,
  };
}

function attachmentPreviewUrl(objectPath: string): string {
  const path = objectPath.replace(/^\/objects\//, "");
  return `/api/storage/objects/${path}`;
}

function isImageAttachment(contentType: string, fileName: string): boolean {
  if (contentType.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(fileName);
}

function isImageUrl(text: string): boolean {
  const attachment = parseAttachmentContent(text);
  if (attachment) return isImageAttachment(attachment.contentType, attachment.fileName);
  return /\.(jpe?g|png|gif|webp|heic)(\?.*)?$/i.test(text.trim());
}

function isMediaUrl(text: string): boolean {
  if (parseAttachmentContent(text)) return true;
  const t = text.trim();
  if (!t.startsWith("http://") && !t.startsWith("https://") && !t.startsWith("/api/storage/")) return false;
  return /\.(jpe?g|png|gif|webp|heic|pdf|doc|docx|mp4|mp3|ogg|wav)(\?.*)?$/i.test(t);
}

function getDeliveryStatus(message: Message): DeliveryStatus {
  if (message.id.startsWith("optimistic-")) return "pending";
  if (message.direction === "outbound")
    return message.whatsappMessageId ? "delivered" : "sent";
  return "delivered";
}

function BubbleTailOut() {
  return (
    <svg
      aria-hidden
      className="absolute top-0 -right-[6px] pointer-events-none"
      width="8"
      height="8"
      viewBox="0 0 8 8"
    >
      <path d="M0 0 H8 L0 8 Z" fill={BRAND} />
    </svg>
  );
}

function BubbleTailIn({ alert }: { alert?: boolean }) {
  const fill = alert ? "#fef2f2" : "#ffffff";
  return (
    <svg
      aria-hidden
      className="absolute top-0 -left-[6px] pointer-events-none"
      width="8"
      height="8"
      viewBox="0 0 8 8"
    >
      <path d="M8 0 H0 L8 8 Z" fill={fill} />
      {alert && (
        <path
          d="M8 0 H0"
          fill="none"
          stroke="#fca5a5"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

function MessageBubble({ message, isOutbound }: { message: Message; isOutbound: boolean }) {
  const { t }            = useTranslation();
  const deliveryStatus   = getDeliveryStatus(message);
  const isAlert          = message.isRedAlert;

  return (
    <div
      className={cn(
        "flex mb-1 overflow-visible",
        isOutbound ? "justify-end pl-10 pr-3" : "justify-start pr-10 pl-3",
      )}
    >
      <div
        className={cn(
          "relative min-w-0 w-fit max-w-[min(76%,calc(100%-1rem))] px-3.5 py-2 shadow-sm",
          isOutbound
            ? "rounded-2xl rounded-tr-none mr-1.5 self-end"
            : "rounded-2xl rounded-tl-none ml-1.5 self-start",
          isAlert && !isOutbound && "ring-1 ring-inset ring-[#dc2626]/30",
        )}
        style={
          isOutbound
            ? { backgroundColor: BRAND, color: "#ffffff" }
            : isAlert
            ? { backgroundColor: "#fef2f2", color: "#0f172a" }
            : { backgroundColor: "#ffffff", color: "#0f172a" }
        }
      >
        {isOutbound ? <BubbleTailOut /> : <BubbleTailIn alert={isAlert} />}
        {isOutbound && message.senderId === null && (
          <div className="text-xs opacity-60 mb-0.5 font-medium">🤖 Бот</div>
        )}
        {isAlert && !isOutbound && (
          <div className="flex items-center gap-1 text-[#dc2626] mb-1 text-xs font-semibold">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>{t("chat.redAlert")}</span>
          </div>
        )}
        {isMediaUrl(message.content) ? (
          (() => {
            const attachment = parseAttachmentContent(message.content);
            const mediaUrl = attachment
              ? attachmentPreviewUrl(attachment.objectPath)
              : message.content;
            const fileLabel = attachment?.fileName ?? message.content.split("/").pop() ?? "Файл";
            return (
              <div className="space-y-1">
                {attachment?.caption && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{attachment.caption}</p>
                )}
                <a href={mediaUrl} target="_blank" rel="noreferrer" className="block">
                  {isImageUrl(message.content) ? (
                    <img
                      src={mediaUrl}
                      alt={fileLabel}
                      className="max-w-full rounded-lg max-h-[240px] object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex items-center gap-2 py-1">
                      <Paperclip className="w-4 h-4 shrink-0 opacity-70" />
                      <span className="text-sm underline break-all">{fileLabel}</span>
                    </div>
                  )}
                </a>
              </div>
            );
          })()
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ overflowWrap: "anywhere" }}>{message.content}</p>
        )}
        <div
          className={cn(
            "flex items-center justify-end gap-0.5 mt-0.5 text-xs select-none",
            isOutbound ? "opacity-70 text-white/80" : "text-[#94a3b8]",
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
          "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full shadow-sm",
          isStart
            ? "bg-[#f0fdf4] text-[#16a34a] border border-[#16a34a]/20"
            : "bg-[#fef2f2] text-[#dc2626] border border-[#dc2626]/20",
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
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const qc              = useQueryClient();
  const formatDate      = useChatDateLabel();
  const [uploadingFile, setUploadingFile] = useState(false);

  const [sessionHistory, setSessionHistory] = useState<ChatSessionData[]>([]);

  const fetchSession = useCallback(async () => {
    try {
      const res = await customFetch<{
        success: boolean;
        data: { session: ChatSessionData | null; history: ChatSessionData[] };
      }>(`/api/patients/${patient.id}/chat-session`);
      setSessionHistory(res.data.history);
    } catch {
      // ignore
    }
  }, [patient.id]);

  useEffect(() => {
    setSessionHistory([]);
    fetchSession();
    const iv = setInterval(fetchSession, 10_000);
    return () => clearInterval(iv);
  }, [patient.id, fetchSession]);

  const { data, isLoading, isError } = useListMessages(patient.id, {
    query: {
      queryKey: getListMessagesQueryKey(patient.id),
      refetchInterval: 5000,
    },
  });

  const sendMutation = useSendMessage({
    mutation: {
      onMutate: async (vars) => {
        const optimisticContent = vars.data.attachment
          ? `${ATTACHMENT_PREFIX}${vars.data.attachment.objectPath}|${vars.data.attachment.fileName}|${vars.data.attachment.contentType}`
          : (vars.data.content ?? "");
        const optimistic: Message = {
          id:               `optimistic-${Date.now()}`,
          clinicId:         user!.clinicId,
          patientId:        patient.id,
          direction:        "outbound",
          senderId:         user!.id,
          content:          optimisticContent,
          whatsappMessageId: null,
          isRedAlert:       false,
          createdAt:        new Date().toISOString(),
        };
        qc.setQueryData(getListMessagesQueryKey(patient.id), (old: typeof data) => {
          if (!old?.data?.messages) return old;
          return { ...old, data: { messages: [...old.data.messages, optimistic] } };
        });
        return { optimistic, draftText: vars.data.content ?? "" };
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListMessagesQueryKey(patient.id) });
      },
      onError: (_err, vars, context) => {
        if (context?.optimistic) {
          qc.setQueryData(getListMessagesQueryKey(patient.id), (old: typeof data) => {
            if (!old?.data?.messages) return old;
            return {
              ...old,
              data: { messages: old.data.messages.filter((m) => m.id !== context.optimistic.id) },
            };
          });
        }
        if (!vars.data.attachment && context?.draftText) {
          setText(context.draftText);
        }
        toast.error(t("chat.sendError", { defaultValue: "Не удалось отправить сообщение" }));
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingFile(true);
    try {
      const tok = localStorage.getItem("auth_token");
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = (await urlRes.json()) as { uploadURL: string; objectPath: string };

      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error("Upload failed");

      sendMutation.mutate({
        patientId: patient.id,
        data: {
          content: "",
          attachment: {
            objectPath,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
          },
        },
      });
    } catch {
      toast.error(t("chat.uploadError", { defaultValue: "Не удалось загрузить файл" }));
    } finally {
      setUploadingFile(false);
    }
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
    <div className="flex flex-col h-full min-w-0">
      <PageHeader
        title={patient.name}
        subtitle={patient.phone}
        onBack={onBack}
        sticky={false}
        icon={<Avatar name={patient.name} size={36} />}
        badge={
          <span className="flex items-center gap-1.5 shrink-0">
            <WhatsAppIcon size={15} />
            {hasRedAlert && (
              <Badge variant="destructive" className="flex items-center gap-1 shrink-0 text-xs bg-[#fef2f2] text-[#dc2626] border border-[#dc2626]/20 hover:bg-[#fef2f2]">
                <AlertTriangle className="w-3 h-3" />
                {t("chat.redAlert")}
              </Badge>
            )}
          </span>
        }
        className="md:[&>div:first-child>button:first-child]:hidden md:[&>div:first-child>div:first-child]:hidden"
      />

      {/* ── Message feed ── */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden py-3 font-manrope"
        style={{ backgroundColor: CHAT_BG, backgroundImage: DOT_PATTERN }}
      >
        {isLoading && <ChatMessagesSkeleton />}

        {isError && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#fef2f2] border border-[#dc2626]/20 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-[#dc2626]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0f172a]">
                {t("chat.loadError", { defaultValue: "Не удалось загрузить переписку" })}
              </p>
              <p className="text-xs text-[#94a3b8] mt-0.5">
                {t("chat.loadErrorHint", { defaultValue: "Проверьте подключение и попробуйте снова" })}
              </p>
            </div>
          </div>
        )}

        {!isLoading && !isError && messages.length === 0 && sessionHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-md border border-[#e8e3d9] bg-[var(--ds-primary)]/10"
            >
              <WhatsAppIcon size={34} color={BRAND} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#0f172a]">{t("chat.noMessages")}</p>
              <p className="text-xs text-[#94a3b8] mt-0.5">{t("chat.startConversation")}</p>
            </div>
          </div>
        )}

        {!isLoading && !isError && grouped.map((group) => (
          <div key={group.date}>
            <div className="flex justify-center my-3 px-4">
              <span className="text-xs font-medium bg-white text-[#64748b] border border-[#e8e3d9] px-3 py-1 rounded-full shadow-sm">
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

      {/* ── Input area ── */}
      <div className="flex flex-col gap-0 border-t border-[#e8e3d9] shrink-0 bg-[#faf8f4] font-manrope">
        <div className="flex items-end gap-2 px-3 py-2.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile}
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-[#64748b] hover:bg-[#f1ede4] active:scale-95 transition-all disabled:opacity-40"
          >
            {uploadingFile ? (
              <Loader2 className="w-5 h-5 animate-spin text-[#1f75fe]" />
            ) : (
              <Paperclip className="w-5 h-5" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => void handleFileSelect(e)}
          />

          {/* Message textarea */}
          <div className="flex-1 bg-white rounded-xl px-3.5 py-2 shadow-sm border border-[#e8e3d9] flex items-end min-h-[44px] focus-within:border-[var(--ds-primary)] focus-within:ring-2 focus-within:ring-[var(--ds-primary)]/20">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.messagePlaceholder")}
              rows={1}
              className="w-full resize-none outline-none bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] leading-relaxed"
              style={{ maxHeight: 120, minHeight: 24 }}
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-105 active:scale-95 disabled:opacity-40 shadow-md bg-[var(--ds-primary)] hover:bg-[#1a65e8]"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
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
    <PageShell className="flex overflow-hidden h-full w-full max-w-full" animate={false}>
      <aside
        className={cn(
          "flex flex-col border-r border-[#e8e3d9] bg-[#faf8f4]",
          "w-full md:w-80 md:shrink-0",
          selectedPatientId ? "hidden md:flex" : "flex",
        )}
      >
        <PageHeader
          title={t("chat.title")}
          icon={<WhatsAppIcon size={18} />}
          sticky={false}
          className="[&>div:first-child>div:first-child]:hidden"
          right={
            isOwner && (waConnected || waConfigured) ? (
              <button
                type="button"
                onClick={handleOpenChangeModal}
                title="Изменить WhatsApp"
                className="flex items-center gap-1 text-xs text-[#94a3b8] hover:text-[#64748b] transition-colors px-2 py-1 rounded-xl hover:bg-[#f1ede4]"
              >
                <Pencil className="w-3 h-3" />
                <span>Изменить</span>
              </button>
            ) : undefined
          }
          bottom={
            <>
              {!waStatusLoading && !waConnected && !isOwner && (
                <div className="bg-[#fef3c7] border border-[#d97706]/20 rounded-xl p-3 mb-3">
                  <p className="text-xs text-[#d97706] leading-relaxed">
                    WhatsApp не подключён. Обратитесь к Владельцу клиники, чтобы он подключил WhatsApp.
                  </p>
                </div>
              )}

              {!waStatusLoading && waConnected && waStatus?.phone && (
                <div className="flex items-center gap-1.5 mb-3 px-1">
                  <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
                  <p className="text-xs text-[#64748b] font-mono">+{waStatus.phone}</p>
                </div>
              )}

              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("chat.searchPlaceholder")}
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#e8e3d9] rounded-xl text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20 transition-all"
                />
              </div>
            </>
          }
        />

        <div className="flex-1 overflow-y-auto">
          {patientsLoading && (
            <div className="p-3 space-y-2">
              {[0,1,2,3,4].map(i => (
                <div key={i} className="h-16 bg-[#f1ede4] rounded-xl animate-pulse" />
              ))}
            </div>
          )}
          {!patientsLoading && filtered.length === 0 && (
            <div className="p-8 text-center">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 text-[#94a3b8]/40" />
              <p className="text-xs text-[#64748b]">{t("chat.noPatients")}</p>
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
            className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center font-manrope"
            style={{ backgroundColor: CHAT_BG, backgroundImage: DOT_PATTERN }}
          >
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg border border-[#e8e3d9] bg-[var(--ds-primary)]/10"
            >
              <WhatsAppIcon size={44} color={BRAND} />
            </div>
            <div>
              <p className="font-semibold text-[#0f172a] text-base">{t("chat.selectPatient")}</p>
              <p className="text-xs text-[#94a3b8] mt-1">{t("chat.selectPatientHint")}</p>
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
    </PageShell>
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
  const safeName = patient.name || "Patient";
  const { bg, text } = getAvatarColor(safeName);
  const initials = safeName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all border-b border-[#e8e3d9]",
        isSelected
          ? "bg-[var(--ds-primary)]/10 border-l-[3px] border-l-[#1f75fe]"
          : "hover:bg-[#faf8f4] border-l-[3px] border-l-transparent",
      )}
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
            style={{ backgroundColor: "#16a34a" }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={cn("font-semibold text-sm truncate", isSelected ? "text-[#1f75fe]" : "text-[#0f172a]")}>
            {patient.name}
          </p>
          {isActive && (
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0 bg-[var(--ds-primary)]/10 text-[#1f75fe]">
              активен
            </span>
          )}
        </div>
        <p className="text-xs text-[#64748b] truncate mt-0.5">{patient.phone}</p>
      </div>
      {isSelected && (
        <div className="w-2 h-2 rounded-full shrink-0 bg-[var(--ds-primary)]" />
      )}
    </button>
  );
}

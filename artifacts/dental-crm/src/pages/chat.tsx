import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPatients,
  useListMessages,
  useSendMessage,
  getListPatientsQueryKey,
  getListMessagesQueryKey,
} from "@workspace/api-client-react";
import type { Patient, Message } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";
import { AlertTriangle, Send, MessageSquare, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function MessageBubble({ message, isOutbound }: { message: Message; isOutbound: boolean }) {
  return (
    <div className={cn("flex mb-3", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm",
          isOutbound
            ? "bg-green-500 text-white rounded-br-md"
            : "bg-white text-foreground border border-border/60 rounded-bl-md",
          message.isRedAlert && !isOutbound && "border-red-300 bg-red-50",
        )}
      >
        {message.isRedAlert && (
          <div className="flex items-center gap-1 text-red-600 mb-1 text-xs font-semibold">
            <AlertTriangle className="w-3 h-3" />
            <span>Red Alert</span>
          </div>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        <p
          className={cn(
            "text-[10px] mt-1 text-right",
            isOutbound ? "text-green-100" : "text-muted-foreground",
          )}
        >
          {formatTime(message.createdAt)}
          {message.isRedAlert && isOutbound && (
            <span className="ml-1">🚨</span>
          )}
        </p>
      </div>
    </div>
  );
}

function ChatPanel({ patient }: { patient: Patient }) {
  const { user } = useAuthStore();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useListMessages(patient.id, {
    query: {
      queryKey: getListMessagesQueryKey(patient.id),
      refetchInterval: 5000, // poll for new messages every 5s
    },
  });

  const sendMutation = useSendMessage({
    mutation: {
      onMutate: async (vars) => {
        // Optimistic update
        const optimistic: Message = {
          id: `optimistic-${Date.now()}`,
          clinicId: user!.clinicId,
          patientId: patient.id,
          direction: "outbound",
          senderId: user!.id,
          content: vars.data.content,
          whatsappMessageId: null,
          isRedAlert: false,
          createdAt: new Date().toISOString(),
        };
        qc.setQueryData(getListMessagesQueryKey(patient.id), (old: typeof data) => {
          if (!old?.data?.messages) return old;
          return {
            ...old,
            data: { messages: [...old.data.messages, optimistic] },
          };
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
    sendMutation.mutate({ patientId: patient.id, data: { content: trimmed } });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group messages by date
  const grouped: { date: string; messages: Message[] }[] = [];
  for (const msg of messages) {
    const d = formatDate(msg.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && last.date === d) {
      last.messages.push(msg);
    } else {
      grouped.push({ date: d, messages: [msg] });
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border/50 bg-white">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
          <User className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <p className="font-semibold text-foreground">{patient.name}</p>
          <p className="text-xs text-muted-foreground">{patient.phone}</p>
        </div>
        {messages.some((m) => m.isRedAlert) && (
          <Badge variant="destructive" className="ml-auto flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Red Alert
          </Badge>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-6 py-4 bg-[#ECE5DD]">
        {isLoading && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Загрузка сообщений...
          </div>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <MessageSquare className="w-10 h-10 opacity-30" />
            <p className="text-sm">Нет сообщений. Начните переписку.</p>
          </div>
        )}
        {grouped.map((group) => (
          <div key={group.date}>
            <div className="flex justify-center my-3">
              <span className="text-[11px] bg-white/70 text-muted-foreground px-3 py-1 rounded-full shadow-sm">
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
        <div ref={bottomRef} />
      </ScrollArea>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-border/50 flex items-end gap-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Введите сообщение... (Enter для отправки)"
          className="resize-none min-h-[44px] max-h-32 flex-1 text-sm"
          rows={1}
        />
        <Button
          onClick={handleSend}
          disabled={!text.trim() || sendMutation.isPending}
          size="icon"
          className="h-11 w-11 rounded-full bg-green-500 hover:bg-green-600 shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data } = useListPatients({
    query: { queryKey: getListPatientsQueryKey() },
  });

  const patients = data?.data?.patients ?? [];

  const filtered = patients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  return (
    <div className="flex h-full rounded-xl overflow-hidden border border-border/50 shadow-sm bg-white">
      {/* Left Panel — patient list */}
      <aside className="w-80 border-r border-border/50 flex flex-col bg-white shrink-0">
        <div className="p-4 border-b border-border/50">
          <h2 className="font-semibold text-foreground mb-3">WhatsApp Чат</h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск пациента..."
              className="pl-9 text-sm"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Пациенты не найдены
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
        </ScrollArea>
      </aside>

      {/* Right Panel — chat */}
      <main className="flex-1 flex flex-col">
        {selectedPatient ? (
          <ChatPanel patient={selectedPatient} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground bg-[#ECE5DD]">
            <MessageSquare className="w-16 h-16 opacity-20" />
            <p className="text-sm font-medium">Выберите пациента для переписки</p>
          </div>
        )}
      </main>
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
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-border/30",
        isSelected
          ? "bg-green-50 border-l-2 border-l-green-500"
          : "hover:bg-slate-50",
      )}
    >
      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
        <span className="text-green-700 font-bold text-sm">
          {patient.name.charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-foreground truncate">{patient.name}</p>
        <p className="text-xs text-muted-foreground truncate">{patient.phone}</p>
      </div>
    </button>
  );
}

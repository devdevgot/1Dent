import { useListPatientBroadcastHistory } from "@workspace/api-client-react";
import { Megaphone, Sparkles, MessageCircle, CalendarCheck, Loader2 } from "lucide-react";

type Props = {
  patientId: string;
};

function formatDt(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("ru", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PatientBroadcastHistory({ patientId }: Props) {
  const { data, isLoading } = useListPatientBroadcastHistory(patientId);
  const deliveries = data?.data?.deliveries ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        <span className="text-xs">Загрузка рассылок…</span>
      </div>
    );
  }

  if (deliveries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--ds-border)] bg-[var(--bg)] p-4 text-center">
        <Megaphone className="h-5 w-5 text-[var(--text-subtle)] mx-auto mb-1.5" />
        <p className="text-caption text-[var(--text-secondary)]">Рассылок по WhatsApp пока не было</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {deliveries.map((d) => (
        <div key={d.id} className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-caption text-[var(--text-secondary)]">
              <Megaphone className="h-3.5 w-3.5" />
              <span>{formatDt(d.sentAt)}</span>
            </div>
            {d.usedAi && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#ede9fe] text-[#7c3aed] border border-[#ddd6fe]">
                <Sparkles className="h-2.5 w-2.5" />
                ИИ
              </span>
            )}
          </div>
          <p className="text-caption text-[var(--text)] leading-relaxed whitespace-pre-wrap line-clamp-4">
            {d.content}
          </p>
          <div className="flex flex-wrap gap-2">
            {d.repliedAt ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0]">
                <MessageCircle className="h-2.5 w-2.5" />
                Ответ {formatDt(d.repliedAt)}
              </span>
            ) : (
              <span className="text-[10px] text-[var(--text-subtle)]">Без ответа</span>
            )}
            {d.bookedAt && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
                <CalendarCheck className="h-2.5 w-2.5" />
                Запись {formatDt(d.bookedAt)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

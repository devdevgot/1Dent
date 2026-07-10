import { CheckCheck } from "lucide-react";
import { PagePreviewFrame } from "./page-preview-frame";

const BRAND = "#1f75fe";

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2);
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-bold text-[11px]"
      style={{ width: 32, height: 32, backgroundColor: "#bbf7d0", color: "#14532d" }}
    >
      {initials}
    </div>
  );
}

const MESSAGES = [
  { from: "them", text: "Здравствуйте, хочу записаться на чистку", time: "10:42" },
  { from: "me", text: "Добрый день! Конечно. Ближайшее время — завтра в 10:00 или 14:30.", time: "10:42", read: true },
  { from: "them", text: "Завтра в 10:00 подойдёт", time: "10:43" },
  { from: "me", text: "Записала! Накануне придёт напоминание в WhatsApp.", time: "10:43", read: true },
];

export function ChatPageMockup() {
  return (
    <PagePreviewFrame title="Чат — WhatsApp">
      <div className="flex flex-col min-h-[220px] bg-white">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#e8e3d9] bg-white">
          <Avatar name="Асель Нурова" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#0f172a] truncate">Асель Нурова</p>
            <p className="text-[10px] text-green-600">в сети</p>
          </div>
        </div>
        <div className="flex-1 px-3 py-2 space-y-2 bg-[#faf8f4] overflow-hidden">
          {MESSAGES.map((m, i) => (
            <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-2.5 py-1.5 text-[11px] leading-snug ${
                  m.from === "me"
                    ? "text-white rounded-tr-sm"
                    : "bg-white border border-[#e8e3d9] text-[#0f172a] rounded-tl-sm"
                }`}
                style={m.from === "me" ? { backgroundColor: BRAND } : undefined}
              >
                {m.text}
                <div className={`flex items-center gap-0.5 mt-0.5 ${m.from === "me" ? "justify-end" : ""}`}>
                  <span className={`text-[9px] ${m.from === "me" ? "text-white/70" : "text-[#94a3b8]"}`}>{m.time}</span>
                  {m.read && <CheckCheck className="w-3 h-3 text-white/70" />}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PagePreviewFrame>
  );
}

import { CheckCheck } from "lucide-react";
import { PagePreviewFrame } from "./page-preview-frame";

const BRAND = "#1f75fe";

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2);
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 font-bold text-xs"
      style={{ width: 36, height: 36, backgroundColor: "#bbf7d0", color: "#14532d" }}
    >
      {initials}
    </div>
  );
}

const MESSAGES = [
  { from: "them", text: "Здравствуйте, хочу записаться на чистку", time: "10:42" },
  { from: "me", text: "Добрый день! Ближайшее время — завтра в 10:00 или 14:30.", time: "10:42", read: true },
  { from: "them", text: "Завтра в 10:00 подойдёт", time: "10:43" },
];

export function ChatPageMockup() {
  return (
    <PagePreviewFrame title="WhatsApp">
      <div className="flex flex-col min-h-[240px] bg-white">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#f1ede4]">
          <Avatar name="Асель Нурова" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0f172a] truncate">Асель Нурова</p>
            <p className="text-xs text-green-600">в сети</p>
          </div>
        </div>
        <div className="flex-1 px-4 py-4 space-y-3 bg-[#faf8f4]">
          {MESSAGES.map((m, i) => (
            <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  m.from === "me"
                    ? "text-white rounded-tr-md"
                    : "bg-white border border-[#e8e3d9] text-[#0f172a] rounded-tl-md"
                }`}
                style={m.from === "me" ? { backgroundColor: BRAND } : undefined}
              >
                {m.text}
                <div className={`flex items-center gap-1 mt-1 ${m.from === "me" ? "justify-end" : ""}`}>
                  <span className={`text-[10px] ${m.from === "me" ? "text-white/70" : "text-[#94a3b8]"}`}>
                    {m.time}
                  </span>
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

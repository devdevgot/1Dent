import { CheckCheck } from "lucide-react";
import {
  FloatingBadge,
  IllustrationCanvas,
  IllustrationCard,
} from "./illustration-primitives";

const MESSAGES = [
  { side: "left", text: "Здравствуйте, хочу записаться на чистку" },
  { side: "right", text: "Добрый день! Завтра в 10:00 или 14:30?" },
  { side: "left", text: "Завтра в 10:00 подойдёт" },
];

export function WhatsappIllustration() {
  return (
    <IllustrationCanvas>
      <FloatingBadge className="right-[8%] top-[10%]" variant="solid">
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
          в сети
        </span>
      </FloatingBadge>
      <FloatingBadge className="left-[6%] bottom-[14%]" variant="muted">
        Напоминание
      </FloatingBadge>

      <IllustrationCard className="absolute left-1/2 top-1/2 w-[78%] -translate-x-1/2 -translate-y-1/2 p-3">
        <div className="flex items-center gap-2 border-b border-[#e8e3d9] pb-2 mb-3">
          <span className="w-8 h-8 rounded-full bg-[#dcfce7] text-[#15803d] text-xs font-bold flex items-center justify-center">
            АН
          </span>
          <div>
            <p className="text-xs font-semibold text-[#0f172a]">Асель Нурова</p>
            <p className="text-[10px] text-[#22c55e]">WhatsApp</p>
          </div>
        </div>
        <div className="space-y-2">
          {MESSAGES.map((message) => (
            <div
              key={message.text}
              className={`flex ${message.side === "right" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-2.5 py-1.5 text-[10px] leading-snug ${
                  message.side === "right"
                    ? "bg-[#1f75fe] text-white rounded-tr-md"
                    : "bg-white border border-[#e8e3d9] text-[#0f172a] rounded-tl-md"
                }`}
              >
                {message.text}
                {message.side === "right" ? (
                  <CheckCheck className="w-3 h-3 text-white/70 mt-1 ml-auto" />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </IllustrationCard>
    </IllustrationCanvas>
  );
}

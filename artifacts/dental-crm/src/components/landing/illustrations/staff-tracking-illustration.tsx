import { LogIn, LogOut, Send } from "lucide-react";
import {
  FloatingBadge,
  IllustrationCanvas,
  IllustrationCard,
} from "./illustration-primitives";

const EVENTS = [
  { name: "Айгуль О.", type: "in", time: "08:58" },
  { name: "Данияр К.", type: "in", time: "09:02" },
  { name: "Мадина С.", type: "out", time: "18:14" },
];

export function StaffTrackingIllustration() {
  return (
    <IllustrationCanvas>
      <FloatingBadge className="left-[4%] top-[14%]">Геозона 150 м</FloatingBadge>
      <FloatingBadge className="right-[4%] bottom-[14%]" variant="solid">
        <span className="inline-flex items-center gap-1">
          <Send className="w-3 h-3" />
          Telegram
        </span>
      </FloatingBadge>

      <IllustrationCard className="absolute left-1/2 top-[18%] w-[84%] -translate-x-1/2 p-2.5">
        <p className="text-[10px] font-semibold text-[#0f172a]">Филиал на Абая</p>
        <p className="text-[9px] text-[#64748b]">Отметка при входе в клинику</p>
      </IllustrationCard>

      <IllustrationCard className="absolute left-1/2 bottom-[10%] w-[84%] -translate-x-1/2 p-2.5">
        <div className="space-y-1.5">
          {EVENTS.map((event) => (
            <div key={`${event.name}-${event.time}`} className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium text-[#0f172a]">{event.name}</span>
              <span
                className={`inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full ${
                  event.type === "in"
                    ? "bg-[#dbeafe] text-[#1d4ed8]"
                    : "bg-[#fef3c7] text-[#b45309]"
                }`}
              >
                {event.type === "in" ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                {event.type === "in" ? "Приход" : "Уход"}
              </span>
              <span className="text-[10px] font-mono text-[#64748b]">{event.time}</span>
            </div>
          ))}
        </div>
      </IllustrationCard>
    </IllustrationCanvas>
  );
}

import {
  FloatingBadge,
  IllustrationCanvas,
  IllustrationCard,
} from "./illustration-primitives";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт"];
const SLOTS = [
  { time: "09:00", patient: "Асель Н." },
  { time: "10:30", patient: "Данияр К." },
  { time: "12:00", patient: "Мадина С." },
];

export function CalendarIllustration() {
  return (
    <IllustrationCanvas>
      <FloatingBadge className="right-[6%] top-[12%]" variant="solid">
        Напоминание отправлено
      </FloatingBadge>
      <FloatingBadge className="left-[5%] bottom-[14%]" variant="muted">
        WhatsApp
      </FloatingBadge>

      <IllustrationCard className="absolute left-1/2 top-1/2 w-[80%] -translate-x-1/2 -translate-y-1/2 p-3">
        <div className="grid grid-cols-5 gap-1 mb-3">
          {DAYS.map((day, index) => (
            <div
              key={day}
              className={`text-center text-[9px] py-1 rounded-lg font-semibold ${
                index === 2 ? "bg-[#1f75fe] text-white" : "bg-[#eff6ff] text-[#64748b]"
              }`}
            >
              {day}
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          {SLOTS.map((slot) => (
            <div
              key={slot.time}
              className="flex items-center gap-2 rounded-xl border border-[#dbeafe] bg-[#eff6ff] px-2 py-1.5"
            >
              <span className="text-[10px] font-mono font-bold text-[#1f75fe]">{slot.time}</span>
              <span className="text-[10px] font-medium text-[#0f172a]">{slot.patient}</span>
            </div>
          ))}
        </div>
      </IllustrationCard>
    </IllustrationCanvas>
  );
}

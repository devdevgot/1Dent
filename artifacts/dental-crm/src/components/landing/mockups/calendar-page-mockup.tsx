import { PagePreviewFrame } from "./page-preview-frame";

const SLOTS = [
  { time: "09:00", patient: "Асель Н.", doctor: "Сейткали", color: "#dbeafe" },
  { time: "10:30", patient: "Данияр К.", doctor: "Омарова", color: "#d1fae5" },
  { time: "12:00", patient: "Светлана М.", doctor: "Сейткали", color: "#fef3c7" },
];

export function CalendarPageMockup() {
  return (
    <PagePreviewFrame title="Календарь">
      <div className="p-3 bg-white min-h-[220px]">
        <div className="flex gap-1 mb-3">
          {["Пн 7", "Вт 8", "Ср 9", "Чт 10", "Пт 11"].map((d, i) => (
            <div
              key={d}
              className={`flex-1 text-center text-[9px] py-1 rounded-lg font-semibold ${
                i === 2 ? "bg-[#1f75fe] text-white" : "text-[#64748b] bg-[#faf8f4]"
              }`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          {SLOTS.map((slot) => (
            <div
              key={slot.time}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 border border-[#e8e3d9]"
              style={{ backgroundColor: slot.color }}
            >
              <span className="text-[10px] font-mono font-bold text-[#0f172a] w-9">{slot.time}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold text-[#0f172a] truncate">{slot.patient}</p>
                <p className="text-[9px] text-[#64748b]">{slot.doctor}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PagePreviewFrame>
  );
}

import { LogIn, LogOut, MapPin, Send } from "lucide-react";
import { PagePreviewFrame } from "./page-preview-frame";

const EVENTS = [
  { id: "1", name: "Айгуль Омарова", type: "checkin" as const, date: "12 июл.", time: "08:58" },
  { id: "2", name: "Данияр Касымов", type: "checkin" as const, date: "12 июл.", time: "09:02" },
  { id: "3", name: "Мадина Сейтова", type: "checkout" as const, date: "12 июл.", time: "18:14" },
  { id: "4", name: "Айгуль Омарова", type: "checkout" as const, date: "12 июл.", time: "18:31" },
];

export function StaffTrackingPageMockup() {
  const checkins = EVENTS.filter((e) => e.type === "checkin").length;
  const checkouts = EVENTS.filter((e) => e.type === "checkout").length;

  return (
    <PagePreviewFrame title="Трекинг сотрудников">
      <div className="p-5 bg-white min-h-[240px] space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-[#e8e3d9] bg-[#faf8f4] p-3">
          <MapPin className="w-4 h-4 text-[#1f75fe] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0f172a]">Филиал на Абая</p>
            <p className="text-xs text-[#64748b] mt-0.5">Геозона 150 м · отметка при входе в клинику</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-[#e8e3d9] bg-[#faf8f4] px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-[#0f172a]">{EVENTS.length}</p>
            <p className="text-[10px] text-[#64748b] mt-0.5">событий</p>
          </div>
          <div className="rounded-xl border border-[#16a34a]/20 bg-[#f0fdf4] px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-[#16a34a]">{checkins}</p>
            <p className="text-[10px] text-[#16a34a] mt-0.5">приходов</p>
          </div>
          <div className="rounded-xl border border-[#d97706]/20 bg-[#fef3c7] px-3 py-2.5 text-center">
            <p className="text-lg font-bold text-[#d97706]">{checkouts}</p>
            <p className="text-[10px] text-[#d97706] mt-0.5">уходов</p>
          </div>
        </div>

        <div className="rounded-xl border border-[#e8e3d9] overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#faf8f4] border-b border-[#e8e3d9]">
                <th className="px-3 py-2 text-[10px] font-medium text-[#64748b]">Сотрудник</th>
                <th className="px-3 py-2 text-[10px] font-medium text-[#64748b]">Событие</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-[#64748b]">Время</th>
              </tr>
            </thead>
            <tbody>
              {EVENTS.map((event, index) => (
                <tr
                  key={event.id}
                  className={index % 2 === 0 ? "bg-white" : "bg-[#faf8f4]/60"}
                >
                  <td className="px-3 py-2.5 text-xs font-medium text-[#0f172a]">{event.name}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full ${
                        event.type === "checkin"
                          ? "bg-[#f0fdf4] text-[#16a34a] border border-[#16a34a]/20"
                          : "bg-[#fef3c7] text-[#d97706] border border-[#d97706]/20"
                      }`}
                    >
                      {event.type === "checkin" ? (
                        <>
                          <LogIn className="w-3 h-3" />
                          Приход
                        </>
                      ) : (
                        <>
                          <LogOut className="w-3 h-3" />
                          Уход
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <p className="text-xs font-mono text-[#0f172a]">{event.time}</p>
                    <p className="text-[10px] text-[#94a3b8]">{event.date}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[#0284c7]/20 bg-[#e0f2fe] px-3 py-2.5">
          <Send className="w-3.5 h-3.5 text-[#0284c7] shrink-0" />
          <p className="text-[11px] text-[#0369a1] leading-snug">
            Уведомление в Telegram: «Айгуль Омарова — приход, 08:58»
          </p>
        </div>
      </div>
    </PagePreviewFrame>
  );
}

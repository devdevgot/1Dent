import { useState, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsSlashTablet } from "@/hooks/use-slash-tablet";

const MONTHS_RU = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const DAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const SCHEDULE_TIME_SLOTS = Array.from({ length: 28 }, (_, i) => {
  const hour = Math.floor(i / 2) + 8;
  const min = i % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${min}`;
});

function buildCalendarWeeks(year: number, month: number): (number | null)[][] {
  const firstDow = new Date(year, month, 1).getDay();
  const padding = (firstDow + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(padding).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export interface TreatmentSchedulePickerProps {
  scheduledAt: string | null;
  onConfirm: (date: string, time: string) => void;
  onClear?: () => void;
  onClose: () => void;
  title?: string;
}

export function TreatmentSchedulePicker({
  scheduledAt,
  onConfirm,
  onClear,
  onClose,
  title = "Назначить дату лечения",
}: TreatmentSchedulePickerProps) {
  const isTablet = useIsSlashTablet();
  const now = new Date();
  const initDate = scheduledAt ? new Date(scheduledAt) : now;

  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [selDate, setSelDate] = useState(
    scheduledAt
      ? `${initDate.getFullYear()}-${String(initDate.getMonth() + 1).padStart(2, "0")}-${String(initDate.getDate()).padStart(2, "0")}`
      : "",
  );
  const [selTime, setSelTime] = useState(
    scheduledAt
      ? `${String(initDate.getHours()).padStart(2, "0")}:${String(initDate.getMinutes()).padStart(2, "0")}`
      : "09:00",
  );

  const timeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = timeRef.current?.querySelector("[data-selected='true']");
    el?.scrollIntoView({ block: "center" });
  }, []);

  const weeks = buildCalendarWeeks(viewYear, viewMonth);
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const selectDay = (day: number) => {
    const d = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelDate(d);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className={cn(
        "relative z-10 bg-white rounded-2xl border border-[#e8e3d9] shadow-xl w-full mx-4 overflow-hidden",
        isTablet ? "max-w-lg" : "max-w-sm",
      )}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e3d9]">
          <p className="font-semibold text-[#0f172a] text-[15px]">{title}</p>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#64748b] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f1ede4] transition-colors">
              <ChevronLeft className="w-4 h-4 text-[#64748b]" />
            </button>
            <span className="text-sm font-semibold text-[#0f172a]">
              {MONTHS_RU[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f1ede4] transition-colors">
              <ChevronRight className="w-4 h-4 text-[#64748b]" />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {DAYS_RU.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-[#94a3b8] py-1">{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((day, di) => {
                const isoDay = day
                  ? `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                  : null;
                const isSelected = isoDay === selDate;
                const isToday = isoDay === todayStr;
                const isPast = isoDay ? isoDay < todayStr : false;
                return (
                  <button
                    key={di}
                    type="button"
                    disabled={!day || isPast}
                    onClick={() => day && selectDay(day)}
                    className={cn(
                      "aspect-square flex items-center justify-center text-sm rounded-full transition-all m-0.5",
                      !day && "invisible",
                      isPast && day && "text-[#94a3b8] cursor-not-allowed",
                      isSelected && "bg-primary text-white font-semibold shadow-sm",
                      !isSelected && isToday && "text-primary font-semibold",
                      !isSelected && !isToday && day && !isPast && "text-[#0f172a] hover:bg-primary/10",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mx-5 border-t border-[#e8e3d9] my-1" />

        <div className="px-5 pb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-[#94a3b8]" />
            <span className="text-xs font-medium text-[#64748b] uppercase tracking-wide">Время</span>
          </div>
          <div ref={timeRef} className="h-36 overflow-y-scroll custom-scrollbar space-y-0.5 pr-1">
            {SCHEDULE_TIME_SLOTS.map((slot) => (
              <button
                key={slot}
                data-selected={slot === selTime}
                type="button"
                onClick={() => setSelTime(slot)}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-lg text-sm transition-all",
                  slot === selTime
                    ? "bg-primary text-white font-semibold"
                    : "text-[#0f172a] hover:bg-primary/10",
                )}
              >
                {slot}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-[#e8e3d9] flex gap-3">
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="dash-btn px-3 py-2 !text-red-500 !border-red-200 hover:!bg-red-50 text-[12px] font-semibold"
            >
              Снять
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="dash-btn dash-btn-secondary flex-1 py-2 text-sm font-semibold"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!selDate}
            onClick={() => onConfirm(selDate, selTime)}
            className={cn(
              "dash-btn flex-1 py-2 text-sm font-semibold",
              selDate
                ? "dash-btn-primary"
                : "!bg-[#f1ede4] !text-[#94a3b8] cursor-not-allowed border-[#e8e3d9]",
            )}
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

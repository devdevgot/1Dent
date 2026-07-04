import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Clock, ChevronRight, CalendarDays, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PATIENTS, STATUS_META, CONDITION_META, initials,
  type TabletPatient, type ToothCondition,
} from "./mock-data";

function MiniTeeth({ teeth }: { teeth: Record<number, ToothCondition> }) {
  const entries = Object.entries(teeth)
    .filter(([, c]) => c !== "healthy")
    .slice(0, 6);
  if (entries.length === 0) return <span className="text-xs text-[#94a3b8]">Карта чистая</span>;
  return (
    <div className="flex items-center gap-1.5">
      {entries.map(([fdi, cond]) => (
        <span key={fdi} className="flex items-center gap-0.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CONDITION_META[cond].color }} />
          <span className="text-[10px] font-medium text-[#94a3b8]">{fdi}</span>
        </span>
      ))}
    </div>
  );
}

export function PatientList({ onSelect }: { onSelect: (p: TabletPatient) => void }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return PATIENTS;
    return PATIENTS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.phone.includes(q),
    );
  }, [query]);

  const today = new Date().toLocaleDateString("ru", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-6">
      {/* Заголовок */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-[#0f172a]">
            <Users className="h-6 w-6 text-[#1f75fe]" /> Пациенты
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm capitalize text-[#64748b]">
            <CalendarDays className="h-4 w-4" /> {today} · {PATIENTS.length} приёмов
          </p>
        </div>
      </div>

      {/* Поиск */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#94a3b8]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск пациента по имени или телефону…"
          className="w-full rounded-2xl border border-[#e8e3d9] bg-white py-4 pl-12 pr-4 text-base text-[#0f172a] outline-none transition-colors placeholder:text-[#94a3b8] focus:border-[#1f75fe]"
        />
      </div>

      {/* Сетка карточек */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-[#94a3b8]">
          <Search className="mb-3 h-12 w-12 opacity-40" />
          <p className="text-sm">Пациенты не найдены</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p, i) => {
            const st = STATUS_META[p.status];
            return (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => onSelect(p)}
                className={cn(
                  "group flex flex-col rounded-3xl border bg-white p-5 text-left transition-all hover:shadow-md active:scale-[0.99]",
                  p.isNow ? "border-[#1f75fe] ring-2 ring-[#1f75fe]/20" : "border-[#e8e3d9]",
                )}
              >
                {/* Верх: время + статус */}
                <div className="mb-4 flex items-center justify-between">
                  <span className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold",
                    p.isNow ? "bg-[#1f75fe] text-white" : "bg-[#faf8f4] text-[#0f172a]",
                  )}>
                    <Clock className="h-3.5 w-3.5" />
                    {p.isNow ? "Сейчас" : p.appointmentTime}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ color: st.color, backgroundColor: st.bg }}
                  >
                    {st.label}
                  </span>
                </div>

                {/* Пациент */}
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1f75fe]/10 text-base font-bold text-[#1f75fe]">
                    {initials(p.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold text-[#0f172a] group-hover:text-[#1f75fe]">{p.name}</p>
                    <p className="text-xs text-[#94a3b8]">{p.age} лет · {p.gender === "f" ? "жен." : "муж."}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-[#cbd5e1] group-hover:text-[#1f75fe]" />
                </div>

                {/* Тип визита */}
                <p className="mt-4 rounded-xl bg-[#faf8f4] px-3 py-2 text-sm font-medium text-[#64748b]">
                  {p.visitType}
                </p>

                {/* Мини-карта зубов */}
                <div className="mt-3 flex items-center justify-between border-t border-[#f1ede4] pt-3">
                  <MiniTeeth teeth={p.teeth} />
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}

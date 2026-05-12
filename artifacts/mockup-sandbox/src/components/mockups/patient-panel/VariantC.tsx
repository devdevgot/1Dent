import { useState } from "react";
import {
  Phone, Brain, Activity, CheckCircle2, Circle,
  Clock, MessageSquare, AlertTriangle, Sparkles,
  FileText, ChevronRight, User, Calendar,
} from "lucide-react";

const CONDITIONS: Record<string, { fill: string; stroke: string; label: string }> = {
  healthy:           { fill: "#ffffff", stroke: "#d1fae5", label: "Здоров" },
  cavity:            { fill: "#fef9c3", stroke: "#fbbf24", label: "Кариес" },
  treated:           { fill: "#dbeafe", stroke: "#60a5fa", label: "Пролечен" },
  crown:             { fill: "#fef3c7", stroke: "#f59e0b", label: "Коронка" },
  root_canal:        { fill: "#ffedd5", stroke: "#fb923c", label: "Канал" },
  implant:           { fill: "#d1fae5", stroke: "#34d399", label: "Имплант" },
  missing:           { fill: "#f3f4f6", stroke: "#e5e7eb", label: "Нет" },
  extraction_needed: { fill: "#fee2e2", stroke: "#f87171", label: "Удаление" },
};

const MOCK_TEETH: Record<number, string> = {
  16: "crown", 26: "crown",
  36: "root_canal", 46: "cavity",
  11: "treated", 21: "treated",
  48: "missing", 18: "missing",
  44: "extraction_needed",
};

const UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

function ToothCell({ fdi, selected, onClick }: { fdi: number; selected: boolean; onClick: () => void }) {
  const cond = MOCK_TEETH[fdi] ?? "healthy";
  const cfg = CONDITIONS[cond]!;
  const isMissing = cond === "missing";
  return (
    <div className="flex flex-col items-center gap-0.5 cursor-pointer group" onClick={onClick}>
      <div
        className={`w-8 h-9 rounded-lg border-2 flex items-center justify-center transition-all relative overflow-hidden ${
          selected ? "ring-2 ring-blue-500 ring-offset-1 scale-110 z-10" : "hover:scale-105"
        }`}
        style={{ background: cfg.fill, borderColor: selected ? "#3b82f6" : cfg.stroke }}
      >
        {isMissing && (
          <svg className="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 32 36">
            <line x1={6} y1={6} x2={26} y2={30} stroke="#9ca3af" strokeWidth={2} strokeLinecap="round" />
            <line x1={26} y1={6} x2={6} y2={30} stroke="#9ca3af" strokeWidth={2} strokeLinecap="round" />
          </svg>
        )}
        {cond === "extraction_needed" && (
          <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        )}
      </div>
      <span className={`text-[8px] font-bold ${selected ? "text-blue-600" : "text-gray-300"}`}>{fdi}</span>
    </div>
  );
}

const PLAN_ITEMS = [
  { id: 1, title: "Удаление зуба 44", tooth: 44, price: 15000, done: false, urgent: true,  stage: "surgery" },
  { id: 2, title: "Лечение кариеса зуба 46", tooth: 46, price: 8500, done: false, urgent: false, stage: "therapy" },
  { id: 3, title: "Профессиональная чистка", tooth: null, price: 6000, done: true, urgent: false, stage: "hygiene" },
];

const STAGE_COLORS: Record<string, string> = {
  surgery: "#ef4444", therapy: "#3b82f6", hygiene: "#8b5cf6",
};

export function VariantC() {
  const [selected, setSelected] = useState<number | null>(44);
  const [section, setSection] = useState<"overview" | "plan" | "ai">("overview");

  const selectedInfo = selected ? {
    fdi: selected,
    cond: CONDITIONS[MOCK_TEETH[selected] ?? "healthy"]!,
    condKey: MOCK_TEETH[selected] ?? "healthy",
  } : null;

  return (
    <div className="h-screen w-full flex flex-col bg-[#f7f8fa] font-sans overflow-hidden"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ══ HEADER ══ */}
      <div className="shrink-0 bg-white border-b border-gray-100">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white text-lg font-black shrink-0">А</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-black text-gray-900">Асель Нурланова</h1>
              <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">Консультация</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">34 года · жен. · Д-р Диас Сейткали</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button className="h-9 px-3 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-colors">
              Записать
            </button>
          </div>
        </div>

        {/* Quick info pills */}
        <div className="flex items-center gap-2 px-5 pb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {[
            { Icon: Phone, text: "+7 701 234-56-78" },
            { Icon: Calendar, text: "12.03.1990" },
            { Icon: User, text: "Instagram" },
          ].map(({ Icon, text }) => (
            <div key={text} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 shrink-0">
              <Icon className="w-3 h-3 text-gray-400" />
              <span className="text-[11px] text-gray-600 font-medium">{text}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 shrink-0">
            <MessageSquare className="w-3 h-3 text-green-500" />
            <span className="text-[11px] text-gray-600 font-medium">WhatsApp</span>
          </div>
        </div>

        {/* Section nav */}
        <div className="flex border-t border-gray-100 px-2">
          {[
            { id: "overview" as const, label: "Карта зубов", Icon: Activity },
            { id: "plan" as const, label: "План лечения", Icon: FileText },
            { id: "ai" as const, label: "ИИ анализ", Icon: Brain },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                section === id
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-400 hover:text-gray-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ══ BODY ══ */}
      <div className="flex-1 overflow-y-auto">

        {/* ── DENTAL OVERVIEW ── */}
        {section === "overview" && (
          <div className="p-4 space-y-3">

            {/* Tooth chart card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-700">FDI Зубная карта</p>
                <span className="text-[10px] text-gray-400">Нажмите на зуб</span>
              </div>

              {/* Upper row */}
              <div className="flex justify-center gap-0.5 mb-2">
                {UPPER.map((fdi, i) => (
                  <div key={fdi} className={i === 8 ? "ml-2" : ""}>
                    <ToothCell fdi={fdi} selected={selected === fdi} onClick={() => setSelected(selected === fdi ? null : fdi)} />
                  </div>
                ))}
              </div>

              {/* Midline */}
              <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent my-1.5" />

              {/* Lower row */}
              <div className="flex justify-center gap-0.5 mt-2">
                {LOWER.map((fdi, i) => (
                  <div key={fdi} className={i === 8 ? "ml-2" : ""}>
                    <ToothCell fdi={fdi} selected={selected === fdi} onClick={() => setSelected(selected === fdi ? null : fdi)} />
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 border-t border-gray-50 pt-3">
                {Object.entries(CONDITIONS).filter(([k]) => k !== "healthy").map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded border shrink-0" style={{ background: v.fill, borderColor: v.stroke }} />
                    <span className="text-[9px] text-gray-400">{v.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected tooth detail */}
            {selectedInfo && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
                  <div className="w-9 h-9 rounded-xl border-2 flex items-center justify-center font-bold text-sm"
                    style={{ background: selectedInfo.cond.fill, borderColor: selectedInfo.cond.stroke, color: "#374151" }}>
                    {selectedInfo.fdi % 10}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">Зуб {selectedInfo.fdi}</p>
                    <p className="text-xs font-medium" style={{ color: selectedInfo.cond.stroke }}>{selectedInfo.cond.label}</p>
                  </div>
                  {selectedInfo.condKey === "extraction_needed" && (
                    <div className="ml-auto flex items-center gap-1 text-[10px] text-red-600 font-bold bg-red-50 px-2 py-1 rounded-full">
                      <AlertTriangle className="w-3 h-3" />Срочно
                    </div>
                  )}
                </div>
                <div className="px-4 py-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-gray-400 text-[10px]">Последний визит</p>
                      <p className="font-semibold text-gray-700 mt-0.5">20 апр 2026</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-gray-400 text-[10px]">Стоимость лечения</p>
                      <p className="font-semibold text-gray-700 mt-0.5">15 000 ₸</p>
                    </div>
                  </div>
                  <button className="mt-2 w-full flex items-center justify-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700 py-2 rounded-lg hover:bg-blue-50 transition-colors">
                    Перейти к карточке зуба
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { v: "4",  label: "Пробл.",  color: "#ef4444", bg: "#fef2f2" },
                { v: "2",  label: "Коронки", color: "#f59e0b", bg: "#fffbeb" },
                { v: "2",  label: "Леч-но",  color: "#3b82f6", bg: "#eff6ff" },
                { v: "2",  label: "Нет",     color: "#6b7280", bg: "#f9fafb" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: s.bg }}>
                  <p className="text-lg font-black" style={{ color: s.color }}>{s.v}</p>
                  <p className="text-[9px] text-gray-500 font-medium">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PLAN ── */}
        {section === "plan" && (
          <div className="p-4 space-y-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-800">План лечения #1</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Черновик · 3 шага</p>
                </div>
                <button className="text-xs text-blue-600 font-semibold bg-blue-50 px-2.5 py-1.5 rounded-lg">Согласовать</button>
              </div>
              <div className="divide-y divide-gray-50">
                {PLAN_ITEMS.map((item) => (
                  <div key={item.id} className={`flex items-start gap-3 px-4 py-3.5 ${item.done ? "opacity-60" : ""}`}>
                    <div className="shrink-0 mt-0.5">
                      {item.done
                        ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                        : <Circle className="w-4.5 h-4.5 text-gray-200" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${item.done ? "line-through text-gray-400" : "text-gray-800"}`}>{item.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {item.tooth && (
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">Зуб {item.tooth}</span>
                        )}
                        {item.urgent && (
                          <span className="flex items-center gap-0.5 text-[10px] bg-red-50 text-red-600 font-bold px-1.5 py-0.5 rounded">
                            <AlertTriangle className="w-2.5 h-2.5" />Срочно
                          </span>
                        )}
                        <span className="text-[10px] rounded px-1.5 py-0.5 font-semibold text-white"
                          style={{ background: STAGE_COLORS[item.stage] ?? "#6b7280" }}>
                          {item.stage === "surgery" ? "Хирургия" : item.stage === "therapy" ? "Терапия" : "Гигиена"}
                        </span>
                      </div>
                    </div>
                    <p className={`text-sm font-bold shrink-0 ${item.done ? "text-gray-400" : "text-gray-900"}`}>
                      {item.price.toLocaleString("ru")} ₸
                    </p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-between">
                <p className="text-xs text-blue-100 font-medium">Общая стоимость</p>
                <p className="text-lg font-black text-white">29 500 ₸</p>
              </div>
            </div>
          </div>
        )}

        {/* ── AI ── */}
        {section === "ai" && (
          <div className="p-4 space-y-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                  <Sparkles className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">ИИ-анализ зубной карты</p>
                  <p className="text-[10px] text-violet-200 flex items-center gap-1 mt-0.5">
                    <Clock className="w-2.5 h-2.5" />12 мая 2026, 08:15
                  </p>
                </div>
              </div>
              <div className="p-4 space-y-4">
                <div className="bg-gray-50 rounded-xl p-3.5 space-y-2">
                  <p className="text-xs font-bold text-gray-800">Общая оценка</p>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Состояние полости рта требует внимания: выявлены кариозные поражения и признаки пародонтита.
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-800 mb-2">Приоритетные действия</p>
                  <div className="space-y-2">
                    {[
                      { n: 1, t: "Удаление зуба 44", sub: "Срочно — хроническое воспаление", c: "#ef4444", bg: "#fef2f2" },
                      { n: 2, t: "Лечение кариеса зуба 46", sub: "В течение 2 недель", c: "#f59e0b", bg: "#fffbeb" },
                      { n: 3, t: "Плановая чистка", sub: "Рекомендована через 3 месяца", c: "#3b82f6", bg: "#eff6ff" },
                    ].map((p) => (
                      <div key={p.n} className="flex items-center gap-3 rounded-xl p-3" style={{ background: p.bg }}>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0"
                          style={{ background: p.c }}>{p.n}</div>
                        <div>
                          <p className="text-xs font-bold" style={{ color: p.c }}>{p.t}</p>
                          <p className="text-[10px] text-gray-500">{p.sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-50 rounded-xl p-3.5">
                  <p className="text-xs font-bold text-blue-800 mb-1">Прогноз</p>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    При своевременном лечении риск осложнений минимален. Рекомендуется ортодонтическая консультация.
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-800 mb-2.5">Индикаторы риска</p>
                  {[
                    { label: "Риск кариеса", value: 65, color: "#f59e0b" },
                    { label: "Пародонтит",   value: 30, color: "#ef4444" },
                    { label: "Гигиена",       value: 80, color: "#10b981" },
                  ].map((r) => (
                    <div key={r.label} className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-gray-600 font-medium">{r.label}</p>
                        <p className="text-xs font-black" style={{ color: r.color }}>{r.value}%</p>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${r.value}%`, background: r.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

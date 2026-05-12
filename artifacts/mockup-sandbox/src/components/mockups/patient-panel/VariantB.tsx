import { useState } from "react";
import {
  Phone, Brain, Activity, CheckCircle2, Circle,
  Sparkles, Clock, MessageSquare, AlertTriangle,
  ChevronDown, Play, MoreHorizontal,
} from "lucide-react";

const CONDITIONS: Record<string, { fill: string; stroke: string; label: string; short: string }> = {
  healthy:           { fill: "#f0fdf4", stroke: "#86efac", label: "Здоров",    short: "З" },
  cavity:            { fill: "#fef9c3", stroke: "#fbbf24", label: "Кариес",    short: "К" },
  treated:           { fill: "#eff6ff", stroke: "#93c5fd", label: "Пролечен",  short: "П" },
  crown:             { fill: "#fffbeb", stroke: "#fcd34d", label: "Коронка",   short: "Кр" },
  root_canal:        { fill: "#fff7ed", stroke: "#fb923c", label: "Канал",     short: "Кн" },
  implant:           { fill: "#f0fdf4", stroke: "#34d399", label: "Имплант",   short: "И" },
  missing:           { fill: "#f9fafb", stroke: "#d1d5db", label: "Нет",       short: "—" },
  extraction_needed: { fill: "#fef2f2", stroke: "#f87171", label: "Удаление",  short: "У" },
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

function ToothBtn({ fdi, selected, onSelect }: { fdi: number; selected: boolean; onSelect: () => void }) {
  const cond = MOCK_TEETH[fdi] ?? "healthy";
  const cfg = CONDITIONS[cond]!;
  return (
    <button
      onClick={onSelect}
      title={`${fdi} — ${cfg.label}`}
      style={{ background: cfg.fill, borderColor: selected ? "#6366f1" : cfg.stroke }}
      className={`w-7 h-7 rounded border-2 text-[9px] font-bold flex items-center justify-center transition-all ${
        selected ? "ring-2 ring-indigo-300 scale-110 z-10" : "hover:scale-105"
      }`}
    >
      {fdi % 10}
    </button>
  );
}

const STAGES = [
  {
    label: "Удаление", color: "#ef4444", bg: "#fef2f2",
    items: [{ title: "Удаление зуба 44 (атравматичное)", tooth: 44, price: 15000, status: "pending" as const, urgent: true }],
  },
  {
    label: "Терапия", color: "#3b82f6", bg: "#eff6ff",
    items: [
      { title: "Лечение кариеса зуба 46", tooth: 46, price: 8500, status: "pending" as const, urgent: false },
    ],
  },
  {
    label: "Гигиена", color: "#8b5cf6", bg: "#f5f3ff",
    items: [{ title: "Профессиональная чистка", tooth: null, price: 6000, status: "done" as const, urgent: false }],
  },
];

const AI_SUMMARY = [
  { label: "Кариес риск", value: 65, color: "#f59e0b" },
  { label: "Пародонтит", value: 30, color: "#ef4444" },
  { label: "Гигиена",    value: 80, color: "#10b981" },
];

export function VariantB() {
  const [activeTab, setActiveTab] = useState<"dental" | "ai">("dental");
  const [selectedFdi, setSelectedFdi] = useState<number | null>(44);
  const [expandedStage, setExpandedStage] = useState<string | null>("Удаление");

  return (
    <div className="h-screen w-full flex flex-col bg-gray-100 font-sans overflow-hidden" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* ── Compact top header ── */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black text-base shrink-0">А</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-gray-900 truncate">Асель Нурланова</p>
            <span className="text-[10px] bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded-full shrink-0">Консультация</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">34 г. · +7 701 234-56-78 · Д-р Диас Сейткали</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button className="h-8 w-8 rounded-lg bg-green-50 flex items-center justify-center">
            <Phone className="w-3.5 h-3.5 text-green-600" />
          </button>
          <button className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
            <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <button className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
            <MoreHorizontal className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="flex-1 flex overflow-hidden gap-0">

        {/* ── Left sidebar: status + quick facts ── */}
        <div className="w-[140px] shrink-0 bg-white border-r border-gray-100 flex flex-col overflow-y-auto">
          <div className="p-3 space-y-3">

            <div>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Статус</p>
              <div className="space-y-1">
                {["Лид", "Консультация", "Лечение", "Завершён"].map((s) => (
                  <div key={s} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-semibold ${
                    s === "Консультация"
                      ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                      : "text-gray-400"
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      s === "Консультация" ? "bg-indigo-500" : "bg-gray-200"
                    }`} />
                    {s}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-50 pt-3">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Статистика</p>
              <div className="space-y-2">
                {[
                  { label: "Визитов", v: "12" },
                  { label: "Процедур", v: "8" },
                  { label: "Долг", v: "0 ₸" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-[9px] text-gray-400">{s.label}</p>
                    <p className="text-sm font-black text-gray-800">{s.v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-50 pt-3">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">ИИ риски</p>
              <div className="space-y-2">
                {AI_SUMMARY.map((r) => (
                  <div key={r.label}>
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[9px] text-gray-500">{r.label}</p>
                      <p className="text-[9px] font-bold" style={{ color: r.color }}>{r.value}%</p>
                    </div>
                    <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${r.value}%`, background: r.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ── Right main area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Tab bar */}
          <div className="shrink-0 bg-white border-b border-gray-100 flex px-3">
            {[
              { id: "dental" as const, label: "Зубная карта", Icon: Activity },
              { id: "ai" as const, label: "ИИ анализ", Icon: Brain },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === id
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-400 hover:text-gray-700"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* DENTAL */}
            {activeTab === "dental" && (
              <div className="p-3 space-y-3">

                {/* Tooth grid */}
                <div className="bg-white rounded-xl border border-gray-100 p-3">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Карта зубов FDI</p>
                  <div className="space-y-1.5">
                    {[UPPER, LOWER].map((row, ri) => (
                      <div key={ri} className="flex gap-0.5 justify-center">
                        {row.map((fdi, i) => (
                          <div key={fdi} className={i === 8 ? "ml-2" : ""}>
                            <ToothBtn
                              fdi={fdi}
                              selected={selectedFdi === fdi}
                              onSelect={() => setSelectedFdi(selectedFdi === fdi ? null : fdi)}
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  {selectedFdi && (
                    <div className="mt-2 bg-indigo-50 rounded-lg px-3 py-2 text-xs">
                      <p className="font-semibold text-indigo-800">Зуб {selectedFdi} — {CONDITIONS[MOCK_TEETH[selectedFdi] ?? "healthy"]!.label}</p>
                      <p className="text-indigo-600 text-[10px] mt-0.5">Нажмите для подробностей или начала лечения</p>
                    </div>
                  )}
                </div>

                {/* Treatment stages */}
                <div className="space-y-2">
                  {STAGES.map((stage) => {
                    const isOpen = expandedStage === stage.label;
                    return (
                      <div key={stage.label} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                        <button
                          onClick={() => setExpandedStage(isOpen ? null : stage.label)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                        >
                          <div className="w-1 h-8 rounded-full shrink-0" style={{ background: stage.color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-700">{stage.label}</p>
                            <p className="text-[10px] text-gray-400">{stage.items.length} шаг(а)</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] font-semibold" style={{ color: stage.color }}>
                              {stage.items.reduce((s, i) => s + i.price, 0).toLocaleString("ru")} ₸
                            </span>
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </div>
                        </button>
                        {isOpen && (
                          <div className="border-t border-gray-50 px-3 py-2 space-y-2">
                            {stage.items.map((item, ii) => (
                              <div key={ii} className="flex items-start gap-2.5">
                                {item.status === "done"
                                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                  : <Circle className="w-4 h-4 text-gray-200 shrink-0 mt-0.5" />}
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-medium ${item.status === "done" ? "line-through text-gray-400" : "text-gray-700"}`}>{item.title}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {item.tooth && <span className="text-[9px] text-gray-400">з.{item.tooth}</span>}
                                    {item.urgent && (
                                      <span className="flex items-center gap-0.5 text-[9px] text-red-600 font-semibold">
                                        <AlertTriangle className="w-2.5 h-2.5" />Срочно
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {item.status !== "done" && (
                                  <button className="shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg bg-blue-500 text-white">
                                    <Play className="w-2.5 h-2.5" />
                                    Начать
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Total */}
                <div className="bg-indigo-600 rounded-xl px-4 py-3 flex items-center justify-between">
                  <p className="text-xs text-indigo-200 font-medium">Итого по плану</p>
                  <p className="text-base font-black text-white">29 500 ₸</p>
                </div>
              </div>
            )}

            {/* AI */}
            {activeTab === "ai" && (
              <div className="p-3 space-y-3">
                <div className="bg-gradient-to-b from-violet-50 to-white rounded-xl border border-violet-100 p-3">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-800">ИИ-анализ</p>
                      <p className="text-[9px] text-gray-400 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />12 мая 2026, 08:15
                      </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-3 border border-violet-100 shadow-sm space-y-1.5 text-xs text-gray-700">
                    <p className="font-bold text-gray-900 text-[11px]">Общая оценка</p>
                    <p className="leading-relaxed text-[11px]">Состояние требует внимания: кариозные поражения и признаки пародонтита.</p>
                    <div className="border-t border-gray-100 pt-1.5">
                      <p className="font-bold text-gray-900 text-[11px] mb-1">Приоритеты</p>
                      <div className="space-y-1">
                        {[
                          { t: "Удаление зуба 44 — срочно", c: "text-red-600" },
                          { t: "Лечение кариеса зуба 46 — 2 нед.", c: "text-amber-600" },
                          { t: "Плановая чистка — 3 мес.", c: "text-blue-600" },
                        ].map((p, i) => (
                          <div key={i} className={`flex items-start gap-1.5 text-[11px] font-medium ${p.c}`}>
                            <span className="shrink-0 font-black">{i + 1}.</span>
                            {p.t}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-gray-100 pt-1.5">
                      <p className="text-[11px] text-gray-500 leading-relaxed">
                        При своевременном лечении риск осложнений минимален. Рекомендуется консультация ортодонта.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-3">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Детальные риски</p>
                  {AI_SUMMARY.map((r) => (
                    <div key={r.label} className="mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-gray-600 font-medium">{r.label}</p>
                        <p className="text-xs font-black" style={{ color: r.color }}>{r.value}%</p>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${r.value}%`, background: r.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="shrink-0 bg-white border-t border-gray-100 px-4 py-3">
        <button className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors">
          Записать на приём
        </button>
      </div>
    </div>
  );
}

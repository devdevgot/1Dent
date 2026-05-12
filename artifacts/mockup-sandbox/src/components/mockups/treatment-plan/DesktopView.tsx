import { useState } from "react";
import {
  ArrowLeft, ChevronDown, Plus, FileText, CheckCircle2,
  Stethoscope, Activity, Crown, Scissors, Wrench, Sparkles, Layers,
  Circle, CircleCheck, Pencil, Printer, Play, ClipboardList, User, Phone, CalendarDays, BadgeCheck, MoreHorizontal,
} from "lucide-react";

const STAGES = [
  {
    id: "hygiene", label: "Гигиена", color: "#7c3aed", bg: "#faf5ff", badgeBg: "#ede9fe", textColor: "#6d28d9", icon: Sparkles,
    items: [
      { id: "h1", tooth: null, title: "Профессиональная чистка", price: 12000, status: "completed" },
      { id: "h2", tooth: null, title: "Отбеливание Beyond", price: 45000, status: "pending" },
    ],
  },
  {
    id: "therapy", label: "Кариес / Терапия", color: "#2563eb", bg: "#eff6ff", badgeBg: "#dbeafe", textColor: "#1d4ed8", icon: Stethoscope,
    items: [
      { id: "t1", tooth: 16, title: "Лечение кариеса, пломба светоотверждаемая", price: 18500, status: "completed" },
      { id: "t2", tooth: 24, title: "Лечение кариеса, пломба светоотверждаемая", price: 18500, status: "in_progress" },
      { id: "t3", tooth: 36, title: "Реставрация керамическая (инлей)", price: 35000, status: "pending" },
    ],
  },
  {
    id: "root_canal", label: "Каналы", color: "#ea580c", bg: "#fff7ed", badgeBg: "#ffedd5", textColor: "#c2410c", icon: Activity,
    items: [
      { id: "r1", tooth: 36, title: "Депульпирование, 3 канала, механическая обработка", price: 28000, status: "pending" },
      { id: "r2", tooth: 36, title: "Пломбирование корневых каналов", price: 22000, status: "pending" },
    ],
  },
  {
    id: "orthopedics", label: "Коронки / Ортопедия", color: "#d97706", bg: "#fffbeb", badgeBg: "#fef3c7", textColor: "#b45309", icon: Crown,
    items: [
      { id: "o1", tooth: 36, title: "Коронка металлокерамика на имплант", price: 55000, status: "pending" },
    ],
  },
  {
    id: "surgery", label: "Удаление", color: "#dc2626", bg: "#fef2f2", badgeBg: "#fee2e2", textColor: "#b91c1c", icon: Scissors,
    items: [
      { id: "s1", tooth: 48, title: "Удаление зуба мудрости (сложное)", price: 15000, status: "pending" },
    ],
  },
];

const allItems = STAGES.flatMap(s => s.items);
const totalItems = allItems.length;
const completedItems = allItems.filter(i => i.status === "completed").length;
const totalCost = allItems.reduce((s, i) => s + i.price, 0);
const paidCost = allItems.filter(i => i.status === "completed").reduce((s, i) => s + i.price, 0);
const progress = Math.round((completedItems / totalItems) * 100);

function fmt(n: number) { return n.toLocaleString("ru-KZ") + " ₸"; }

export function DesktopView() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["therapy", "root_canal", "hygiene"]));

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="min-h-screen bg-[#f2f2f7] font-sans flex flex-col" style={{ width: 820 }}>
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-3 shrink-0">
        <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-gray-400" />
          <h1 className="text-[15px] font-bold text-gray-900">План лечения №3</h1>
        </div>
        <span className="text-[11px] text-gray-400">12 мая 2026</span>
        <span className="ml-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full">
          Активен
        </span>
        <span className="flex-1" />
        <button className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
          <Printer className="w-3.5 h-3.5" />
          Печать
        </button>
        <button className="flex items-center gap-1.5 text-[12px] font-bold text-white bg-blue-500 rounded-lg px-3 py-1.5 hover:bg-blue-600 transition-colors">
          <Play className="w-3.5 h-3.5" />
          Начать лечение
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR */}
        <div className="w-[240px] shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto">
          {/* Patient info */}
          <div className="px-4 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-base flex items-center justify-center shrink-0">АД</div>
              <div>
                <p className="text-[13px] font-bold text-gray-900 leading-tight">Ахметова Дина</p>
                <p className="text-[11px] text-gray-400">32 года</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[11.5px] text-gray-600">
                <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                +7 701 234 56 78
              </div>
              <div className="flex items-center gap-2 text-[11.5px] text-gray-600">
                <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                Д-р Сейткали А.
              </div>
              <div className="flex items-center gap-2 text-[11.5px] text-gray-600">
                <CalendarDays className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                Следующий приём: 18 мая
              </div>
            </div>
          </div>

          {/* Progress */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-gray-600">Прогресс</span>
              <span className="text-[12px] font-bold text-gray-800">{progress}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1.5">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[10.5px] text-gray-400">{completedItems} из {totalItems} услуг</p>
          </div>

          {/* Finance summary */}
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[11px] font-semibold text-gray-600 mb-2">Финансы</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">Сумма плана</span>
                <span className="text-[12px] font-bold text-gray-800">{fmt(totalCost)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">Выполнено</span>
                <span className="text-[12px] font-semibold text-emerald-600">{fmt(paidCost)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">Остаток</span>
                <span className="text-[12px] font-semibold text-orange-500">{fmt(totalCost - paidCost)}</span>
              </div>
            </div>
          </div>

          {/* Stage overview */}
          <div className="px-4 py-3 flex-1">
            <p className="text-[11px] font-semibold text-gray-600 mb-2">Этапы</p>
            <div className="space-y-1">
              {STAGES.map(s => {
                const done = s.items.filter(i => i.status === "completed").length;
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${expanded.has(s.id) ? "bg-gray-100" : "hover:bg-gray-50"}`}
                  >
                    <span className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: s.badgeBg }}>
                      <Icon className="w-3 h-3" style={{ color: s.color }} />
                    </span>
                    <span className="flex-1 text-[11.5px] font-medium text-gray-700 truncate">{s.label}</span>
                    <span className="text-[10px] font-semibold shrink-0" style={{ color: done === s.items.length && s.items.length > 0 ? "#059669" : s.color }}>
                      {done}/{s.items.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT MAIN */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {STAGES.map(stage => {
            const Icon = stage.icon;
            const isOpen = expanded.has(stage.id);
            const stageTotal = stage.items.reduce((s, i) => s + i.price, 0);
            const stageDone = stage.items.filter(i => i.status === "completed").length;

            return (
              <div key={stage.id} className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="h-1" style={{ backgroundColor: stage.color }} />

                {/* Section header */}
                <button
                  onClick={() => toggle(stage.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/60 transition-colors"
                >
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: stage.badgeBg }}>
                    <Icon className="w-4 h-4" style={{ color: stage.color }} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800">{stage.label}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {stageDone > 0 ? `${stageDone} выполнено · ` : ""}{stage.items.length - stageDone} ожидает
                    </p>
                  </div>
                  <span className="text-[12px] font-semibold text-gray-500">{fmt(stageTotal)}</span>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: stage.badgeBg, color: stage.color }}>
                    {stage.items.length}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Items table */}
                {isOpen && (
                  <div className="border-t border-gray-100">
                    {/* Column headers */}
                    <div className="grid px-4 py-1.5 border-b border-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                      style={{ gridTemplateColumns: "1fr 80px 90px 36px" }}>
                      <span>Услуга</span>
                      <span className="text-center">Зуб</span>
                      <span className="text-right">Стоимость</span>
                      <span />
                    </div>

                    {stage.items.map((item, idx) => (
                      <div
                        key={item.id}
                        className={`grid items-center px-4 py-2.5 gap-2 group hover:bg-gray-50/60 transition-colors ${idx < stage.items.length - 1 ? "border-b border-gray-50" : ""}`}
                        style={{ gridTemplateColumns: "1fr 80px 90px 36px" }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="shrink-0">
                            {item.status === "completed" ? (
                              <CircleCheck className="w-4 h-4 text-emerald-500" />
                            ) : item.status === "in_progress" ? (
                              <span className="flex w-4 h-4 items-center justify-center">
                                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                              </span>
                            ) : (
                              <Circle className="w-4 h-4 text-gray-200" />
                            )}
                          </div>
                          <span className={`text-[12.5px] font-medium truncate ${item.status === "completed" ? "line-through text-gray-400" : "text-gray-700"}`}>
                            {item.title}
                          </span>
                          {item.status === "in_progress" && (
                            <span className="shrink-0 text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">В процессе</span>
                          )}
                        </div>
                        <div className="text-center">
                          {item.tooth ? (
                            <span className="inline-block text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-medium">з.{item.tooth}</span>
                          ) : (
                            <span className="text-gray-300 text-[11px]">—</span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className={`text-[12px] font-semibold ${item.status === "completed" ? "text-emerald-600" : "text-gray-700"}`}>
                            {fmt(item.price)}
                          </span>
                        </div>
                        <div className="flex items-center justify-center">
                          <button className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Add service row */}
                    <div className="px-4 py-2.5 border-t border-gray-50">
                      <button className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 hover:text-blue-500 transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                        Добавить услугу
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add stage */}
          <button className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-gray-200 text-[12px] font-semibold text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors bg-white">
            <Plus className="w-4 h-4" />
            Добавить этап
          </button>

          {/* Total summary */}
          <div className="bg-white rounded-2xl px-5 py-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
              <span className="text-[13px] font-bold text-gray-800">Итого по плану</span>
              <span className="text-[18px] font-bold text-gray-900">{fmt(totalCost)}</span>
            </div>
            <div className="flex gap-4">
              <div className="flex-1 rounded-xl bg-emerald-50 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-0.5">Выполнено</p>
                <p className="text-[15px] font-bold text-emerald-700">{fmt(paidCost)}</p>
              </div>
              <div className="flex-1 rounded-xl bg-orange-50 px-3 py-2.5">
                <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide mb-0.5">Остаток</p>
                <p className="text-[15px] font-bold text-orange-600">{fmt(totalCost - paidCost)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

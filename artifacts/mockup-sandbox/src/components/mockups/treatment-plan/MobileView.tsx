import { useState } from "react";
import {
  ArrowLeft, ChevronDown, CheckCircle2, Clock, Plus, ClipboardList,
  Stethoscope, Activity, Crown, Scissors, Wrench, Sparkles, Layers,
  MoreHorizontal, FileText, CircleCheck, Circle, Pencil,
} from "lucide-react";

const STAGES = [
  {
    id: "hygiene", label: "Гигиена", color: "#7c3aed", bg: "#faf5ff", badgeBg: "#ede9fe", icon: Sparkles,
    items: [
      { id: "h1", tooth: null, title: "Профессиональная чистка", price: 12000, status: "completed" },
      { id: "h2", tooth: null, title: "Отбеливание Beyond", price: 45000, status: "pending" },
    ],
  },
  {
    id: "therapy", label: "Кариес / Терапия", color: "#2563eb", bg: "#eff6ff", badgeBg: "#dbeafe", icon: Stethoscope,
    items: [
      { id: "t1", tooth: 16, title: "Лечение кариеса, пломба", price: 18500, status: "completed" },
      { id: "t2", tooth: 24, title: "Лечение кариеса, пломба", price: 18500, status: "in_progress" },
      { id: "t3", tooth: 36, title: "Реставрация керамическая", price: 35000, status: "pending" },
    ],
  },
  {
    id: "root_canal", label: "Каналы", color: "#ea580c", bg: "#fff7ed", badgeBg: "#ffedd5", icon: Activity,
    items: [
      { id: "r1", tooth: 36, title: "Депульпирование, 3 канала", price: 28000, status: "pending" },
      { id: "r2", tooth: 36, title: "Пломбирование каналов", price: 22000, status: "pending" },
    ],
  },
  {
    id: "orthopedics", label: "Коронки / Ортопедия", color: "#d97706", bg: "#fffbeb", badgeBg: "#fef3c7", icon: Crown,
    items: [
      { id: "o1", tooth: 36, title: "Коронка металлокерамика", price: 55000, status: "pending" },
    ],
  },
  {
    id: "surgery", label: "Удаление", color: "#dc2626", bg: "#fef2f2", badgeBg: "#fee2e2", icon: Scissors,
    items: [
      { id: "s1", tooth: 48, title: "Удаление зуба мудрости", price: 15000, status: "pending" },
    ],
  },
];

const totalItems = STAGES.flatMap(s => s.items).length;
const completedItems = STAGES.flatMap(s => s.items).filter(i => i.status === "completed").length;
const totalCost = STAGES.flatMap(s => s.items).reduce((s, i) => s + i.price, 0);
const paidCost = STAGES.flatMap(s => s.items).filter(i => i.status === "completed").reduce((s, i) => s + i.price, 0);
const progress = Math.round((completedItems / totalItems) * 100);

function fmt(n: number) { return n.toLocaleString("ru-KZ") + " ₸"; }

export function MobileView() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["therapy", "root_canal"]));

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="min-h-screen bg-[#f2f2f7] font-sans" style={{ width: 390 }}>
      {/* Status bar */}
      <div className="bg-white px-4 pt-3 pb-0">
        <div className="flex items-center justify-between mb-3">
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="text-[13px] font-bold text-gray-900">План лечения №3</p>
            <p className="text-[11px] text-gray-400">Ахметова Дина · 12 мая 2026</p>
          </div>
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>

        {/* Patient strip */}
        <div className="flex items-center gap-3 px-1 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 font-bold text-sm flex items-center justify-center shrink-0">АД</div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-gray-800">Ахметова Дина Серикқызы</p>
            <p className="text-[11px] text-gray-400">32 года · +7 701 234 56 78</p>
          </div>
          <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100 whitespace-nowrap">
            Лечение
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="px-3 pt-3 pb-2 space-y-2">
        {/* Progress card */}
        <div className="bg-white rounded-2xl px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold text-gray-700">Прогресс</span>
            <span className="text-[12px] font-bold text-gray-800">{progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-400">Выполнено {completedItems} из {totalItems} услуг</span>
            <span className="text-[11px] font-semibold text-emerald-600">{fmt(paidCost)}</span>
          </div>
        </div>

        {/* Cost breakdown */}
        <div className="bg-white rounded-2xl px-4 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-2 mb-2.5">
            <FileText className="w-4 h-4 text-gray-400" />
            <span className="text-[12px] font-semibold text-gray-700">Стоимость плана</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] text-gray-400 mb-0.5">Общая сумма</p>
              <p className="text-[22px] font-bold text-gray-900 leading-none">{fmt(totalCost)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-gray-400 mb-0.5">Остаток</p>
              <p className="text-[16px] font-bold text-orange-500 leading-none">{fmt(totalCost - paidCost)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stage sections */}
      <div className="px-3 pb-24 space-y-2">
        {STAGES.map(stage => {
          const Icon = stage.icon;
          const isOpen = expanded.has(stage.id);
          const stageTotal = stage.items.reduce((s, i) => s + i.price, 0);
          const stageDone = stage.items.filter(i => i.status === "completed").length;
          return (
            <div key={stage.id} className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
              {/* Color accent */}
              <div className="h-1" style={{ backgroundColor: stage.color }} />

              {/* Header */}
              <button
                onClick={() => toggle(stage.id)}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
              >
                <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: stage.badgeBg }}>
                  <Icon className="w-4 h-4" style={{ color: stage.color }} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800 leading-tight">{stage.label}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {stageDone > 0 ? `${stageDone} выполнено · ` : ""}{stage.items.length - stageDone} ожидает
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-medium text-gray-500">{fmt(stageTotal)}</span>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ backgroundColor: stage.badgeBg, color: stage.color }}>
                    {stage.items.length}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </div>
              </button>

              {/* Items */}
              {isOpen && (
                <div className="border-t border-gray-100 px-4 py-2.5 space-y-2">
                  {stage.items.map(item => (
                    <div key={item.id}
                      className={`rounded-xl border px-3 py-2.5 flex items-start gap-2.5 ${
                        item.status === "completed"
                          ? "border-emerald-100 bg-emerald-50/40"
                          : item.status === "in_progress"
                          ? "border-blue-200 bg-blue-50/30"
                          : "border-gray-100 bg-gray-50/50"
                      }`}>
                      <div className="shrink-0 mt-0.5">
                        {item.status === "completed" ? (
                          <CircleCheck className="w-4 h-4 text-emerald-500" />
                        ) : item.status === "in_progress" ? (
                          <span className="flex w-4 h-4 items-center justify-center">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                          </span>
                        ) : (
                          <Circle className="w-4 h-4 text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12.5px] font-medium leading-snug ${item.status === "completed" ? "line-through text-gray-400" : "text-gray-700"}`}>
                          {item.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {item.tooth && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">з.{item.tooth}</span>
                          )}
                          <span className="text-[10px] text-gray-400 font-medium">{fmt(item.price)}</span>
                          {item.status === "in_progress" && (
                            <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">В процессе</span>
                          )}
                          {item.status === "completed" && (
                            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Готово</span>
                          )}
                        </div>
                      </div>
                      <button className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors mt-0.5">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Add service */}
                  <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-gray-200 text-[11px] font-semibold text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/30 transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                    Добавить услугу
                  </button>
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
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-gray-100 px-4 py-3 flex gap-2" style={{ maxWidth: 390 }}>
        <button className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
          Распечатать
        </button>
        <button className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-[12px] font-bold hover:bg-blue-600 transition-colors">
          Начать лечение
        </button>
      </div>
    </div>
  );
}

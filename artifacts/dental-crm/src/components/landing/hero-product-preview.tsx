import { motion } from "framer-motion";
import { Users, MessageSquare, BarChart3, Bell, CheckCircle } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { fadeUp } from "@/lib/landing-animations";
import { SITE } from "@/config/site";

function KanbanMini() {
  const stages = [
    { label: "Новая", count: 4, color: "#dbeafe" },
    { label: "Консульт.", count: 6, color: "#fef3c7" },
    { label: "Лечение", count: 5, color: "#d1fae5" },
    { label: "Завершено", count: 12, color: "#e0e7ff" },
  ];
  return (
    <div className="p-3">
      <div className="text-[10px] font-manrope font-bold text-[#0f172a] mb-2">Канбан пациентов</div>
      <div className="flex gap-1.5">
        {stages.map((s) => (
          <div key={s.label} className="flex-1 rounded-lg p-2" style={{ backgroundColor: s.color }}>
            <div className="text-[8px] text-[#64748b] truncate">{s.label}</div>
            <div className="text-sm font-bold text-[#0f172a]">{s.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WhatsAppMini() {
  return (
    <div className="p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <FaWhatsapp size={12} color="#22c55e" />
        <span className="text-[10px] font-bold text-[#0f172a]">WhatsApp</span>
        <span className="ml-auto w-1.5 h-1.5 bg-green-400 rounded-full" />
      </div>
      <div className="space-y-1.5">
        <div className="text-[9px] bg-[#f1ede4] rounded-lg px-2 py-1 text-[#0f172a] w-[75%]">Хочу записаться</div>
        <div className="text-[9px] bg-[var(--ds-primary)] text-white rounded-lg px-2 py-1 ml-auto w-[80%]">Записал на завтра 10:00</div>
      </div>
    </div>
  );
}

function StatsMini() {
  return (
    <div className="p-3 grid grid-cols-2 gap-2">
      {[
        { label: "Доходы", value: "4.2M ₸", bg: "#d1fae5", color: "#065f46" },
        { label: "Пациенты", value: "847", bg: "#e0e7ff", color: "#3730a3" },
      ].map((s) => (
        <div key={s.label} className="rounded-lg p-2" style={{ backgroundColor: s.bg }}>
          <div className="text-[8px]" style={{ color: s.color }}>{s.label}</div>
          <div className="text-xs font-bold" style={{ color: s.color }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

export function HeroProductPreview() {
  return (
    <motion.div
      {...fadeUp(0.2, 28)}
      className="relative w-full max-w-lg mx-auto"
    >
      <div className="landing-product-frame">
        <div className="landing-product-chrome">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#fca5a5]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#fcd34d]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#86efac]" />
          </div>
          <span className="text-[10px] font-manrope text-[#94a3b8] ml-3">app.1dent.kz</span>
        </div>

        <div className="landing-product-body">
          <div className="landing-product-sidebar">
            {[
              { icon: Users, label: "Пациенты", active: true },
              { icon: MessageSquare, label: "Чат" },
              { icon: BarChart3, label: "Аналитика" },
              { icon: Bell, label: "Напоминания" },
            ].map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[9px] font-manrope ${
                  item.active ? "bg-[var(--ds-primary)]/10 text-[var(--ds-primary)] font-semibold" : "text-[#94a3b8]"
                }`}
              >
                <item.icon size={11} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>

          <div className="landing-product-main">
            <KanbanMini />
            <div className="border-t border-[#e8e3d9]" />
            <WhatsAppMini />
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="absolute -right-4 top-8 landing-floating-card p-3 hidden sm:block"
      >
        <StatsMini />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65, duration: 0.5 }}
        className="absolute -left-4 bottom-12 landing-floating-card px-3 py-2 hidden sm:flex items-center gap-2"
      >
        <CheckCircle size={14} className="text-green-500" />
        <span className="text-[10px] font-manrope font-semibold text-[#0f172a]">Запись подтверждена</span>
      </motion.div>
    </motion.div>
  );
}

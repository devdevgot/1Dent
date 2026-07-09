import { motion } from "framer-motion";
import { Tablet, Megaphone, Calendar, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { fadeUp, staggerParentVariants, staggerChildVariants } from "@/lib/landing-animations";

const killers = [
  {
    icon: Tablet,
    label: "Slash Tablet",
    title: "Планшет в кабинете",
    benefit: "Покажите план лечения пациенту на экране",
    desc: "FDI-карта, презентация плана, голосовой диагноз — врач объясняет лечение наглядно, повышая доверие и конверсию.",
    color: "#fce7f3",
    accent: "#db2777",
    mockup: "tablet",
  },
  {
    icon: Megaphone,
    label: "ИИ Рассылка",
    title: "Возврат пациентов автоматически",
    benefit: "Повторные продажи без звонков администратора",
    desc: "Система сама напоминает о профилактике, возвращает после лечения и ведёт по воронке repeat sale.",
    color: "#fef3c7",
    accent: "#d97706",
    mockup: "broadcast",
  },
  {
    icon: Calendar,
    label: "Календарь + напоминания",
    title: "Меньше пустых окон",
    benefit: "Снижение no-show без ручных звонков",
    desc: "Запись в календаре, автоматические WhatsApp-напоминания накануне и за день до приёма.",
    color: "#d1fae5",
    accent: "#059669",
    mockup: "calendar",
  },
];

function TabletMockup() {
  return (
    <div className="landing-mockup bg-white p-4 w-full">
      <div className="text-xs font-manrope font-bold text-[#0f172a] mb-3">План лечения</div>
      <div className="space-y-2">
        {["Диагностика", "Лечение кариеса", "Коронка"].map((step, i) => (
          <div key={step} className="flex items-center gap-2 p-2 rounded-lg bg-[#faf8f4]">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${i === 0 ? "bg-green-500 text-white" : "bg-[#e8e3d9] text-[#64748b]"}`}>
              {i + 1}
            </span>
            <span className="text-[10px] font-manrope text-[#0f172a]">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BroadcastMockup() {
  return (
    <div className="landing-mockup bg-white p-4 w-full">
      <div className="text-xs font-manrope font-bold text-[#0f172a] mb-3">ИИ Рассылка</div>
      <div className="space-y-2">
        <div className="text-[10px] font-manrope text-[#64748b]">Пациенты после лечения</div>
        <div className="flex justify-between text-[10px]">
          <span className="text-[#0f172a] font-semibold">Отправлено</span>
          <span className="text-green-600 font-bold">142</span>
        </div>
        <div className="h-1.5 bg-[#f1ede4] rounded-full">
          <div className="h-1.5 bg-[var(--ds-primary)] rounded-full w-[78%]" />
        </div>
        <div className="text-[9px] text-[#94a3b8]">Конверсия в запись: 23%</div>
      </div>
    </div>
  );
}

function CalendarMockup() {
  const days = ["Пн", "Вт", "Ср", "Чт", "Пт"];
  return (
    <div className="landing-mockup bg-white p-4 w-full">
      <div className="text-xs font-manrope font-bold text-[#0f172a] mb-3">Расписание</div>
      <div className="flex gap-1 mb-2">
        {days.map((d, i) => (
          <div key={d} className={`flex-1 text-center text-[9px] py-1 rounded ${i === 2 ? "bg-[var(--ds-primary)] text-white font-bold" : "text-[#64748b]"}`}>
            {d}
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {["10:00 — Асель Н.", "11:30 — Данияр К.", "14:00 — Светлана М."].map((slot) => (
          <div key={slot} className="text-[9px] font-manrope bg-[#faf8f4] rounded px-2 py-1 text-[#0f172a]">{slot}</div>
        ))}
      </div>
    </div>
  );
}

const mockups: Record<string, React.ComponentType> = {
  tablet: TabletMockup,
  broadcast: BroadcastMockup,
  calendar: CalendarMockup,
};

export function KillerFeatures() {
  return (
    <section id="killer-features" className="bg-white landing-section-sm px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div {...fadeUp(0)} className="text-center mb-16">
          <div className="landing-badge landing-badge-light font-manrope mb-6">
            <span>Убойные фичи</span>
          </div>
          <h2 className="landing-h2 font-manrope text-[#0f172a] mb-4">
            То, чего нет у обычных CRM
          </h2>
          <p className="landing-lead font-manrope max-w-2xl mx-auto">
            Функции, которые напрямую влияют на выручку и качество работы клиники.
          </p>
        </motion.div>

        <div className="space-y-16">
          {killers.map((k, i) => {
            const Mockup = mockups[k.mockup];
            const isEven = i % 2 === 0;
            return (
              <motion.div
                key={k.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className={`grid lg:grid-cols-2 gap-10 lg:gap-16 items-center ${!isEven ? "lg:grid-flow-col-dense" : ""}`}
              >
                <div className={!isEven ? "lg:col-start-2" : ""}>
                  <div
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-manrope font-medium mb-5"
                    style={{ backgroundColor: k.color, color: k.accent }}
                  >
                    <k.icon size={14} />
                    <span>{k.label}</span>
                  </div>
                  <h3 className="landing-h3 font-manrope text-[#0f172a] mb-3">{k.title}</h3>
                  <p className="font-manrope font-semibold text-[#0f172a] text-sm mb-3">
                    Результат: {k.benefit}
                  </p>
                  <p className="landing-lead font-manrope">{k.desc}</p>
                </div>
                <div className={`${!isEven ? "lg:col-start-1 lg:row-start-1" : ""} flex justify-center`}>
                  <div className="w-full max-w-xs">
                    <Mockup />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div {...fadeUp(0.1)} className="text-center mt-16">
          <Link href="#pricing" className="landing-btn landing-btn-secondary font-manrope">
            Узнать тарифы
            <ArrowRight size={16} />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

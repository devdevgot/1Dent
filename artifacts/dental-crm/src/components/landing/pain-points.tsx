import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { fadeUp, staggerParentVariants, staggerChildVariants, EASE } from "@/lib/landing-animations";

const pains = [
  {
    num: "01",
    title: "Пациенты разбросаны по чатам",
    desc: "Заявки в Instagram, WhatsApp, Telegram — всё в разных местах. Кто-то теряется, кто-то ждёт ответа сутками.",
  },
  {
    num: "02",
    title: "Excel вместо CRM",
    desc: "Таблицы, которые никто не обновляет. История лечения — в блокноте врача. Данные теряются при увольнении.",
  },
  {
    num: "03",
    title: "Деньги уходят незаметно",
    desc: "Нет чёткого учёта расходов и доходов. Сколько заработали сегодня? Кто из врачей приносит больше?",
  },
  {
    num: "04",
    title: "Пациент не пришёл — узнали последними",
    desc: "Запись есть, а пациента нет. Без системы напоминаний пустые окна у врача становятся нормой.",
  },
];

export function PainPoints() {
  return (
    <section className="bg-[#faf8f4] py-28 px-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <motion.div {...fadeUp(0)} className="text-center mb-16">
          <h2
            className="font-manrope font-extrabold text-[#0f172a] leading-[1.05] mb-5"
            style={{ fontSize: "clamp(36px, 5vw, 64px)" }}
          >
            Стоматология без
            <br />
            <span className="text-red-500">нормальной системы</span>
          </h2>
          <p className="font-manrope text-[#64748b] text-lg max-w-xl mx-auto">
            Большинство клиник теряют деньги и пациентов просто потому,
            что нет единого инструмента.
          </p>
        </motion.div>

        {/* Cards 2×2 — correct stagger */}
        <motion.div
          variants={staggerParentVariants(0.09)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-30px" }}
          className="grid sm:grid-cols-2 gap-px bg-[#e8e3d9] border border-[#e8e3d9] rounded-2xl overflow-hidden"
        >
          {pains.map((pain, i) => (
            <motion.div
              key={i}
              variants={staggerChildVariants}
              style={{ willChange: "transform, opacity" }}
              className="bg-white p-8 flex flex-col gap-4 group hover:bg-[#faf8f4] transition-colors duration-200"
            >
              <span className="font-manrope font-extrabold text-5xl text-[#e8e3d9] group-hover:text-red-100 transition-colors leading-none select-none">
                {pain.num}
              </span>
              <h3 className="font-manrope font-bold text-[#0f172a] text-xl leading-tight">
                {pain.title}
              </h3>
              <div className="w-8 h-0.5 bg-red-400 rounded-full" />
              <p className="font-manrope text-[#64748b] text-sm leading-relaxed">
                {pain.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Transition arrow */}
        <motion.div {...fadeUp(0.1)} className="mt-16 text-center">
          <p className="font-manrope font-bold text-[#0f172a] text-2xl mb-4">
            1Dent решает всё это одним инструментом
          </p>
          <ArrowDown size={20} className="text-[#94a3b8] mx-auto animate-bounce" />
        </motion.div>

      </div>
    </section>
  );
}

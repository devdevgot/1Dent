import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { fadeUp, staggerParentVariants, staggerChildVariants } from "@/lib/landing-animations";
import { SITE } from "@/config/site";

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
    <section className="bg-[var(--bg)] landing-section px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div {...fadeUp(0)} className="text-center mb-16">
          <h2 className="landing-h2 font-manrope text-[var(--text)] mb-5">
            Стоматология без
            <br />
            <span className="text-[var(--danger)]">нормальной системы</span>
          </h2>
          <p className="landing-lead font-manrope max-w-xl mx-auto">
            Большинство клиник теряют деньги и пациентов просто потому,
            что нет единого инструмента.
          </p>
        </motion.div>

        <motion.div
          variants={staggerParentVariants(0.09)}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-30px" }}
          className="grid sm:grid-cols-2 gap-px bg-[var(--border)] border border-[var(--border)] rounded-[var(--radius-xl)] overflow-hidden shadow-[var(--shadow-sm)]"
        >
          {pains.map((pain, i) => (
            <motion.div
              key={i}
              variants={staggerChildVariants}
              style={{ willChange: "transform, opacity" }}
              className="bg-[var(--surface)] p-8 flex flex-col gap-4 group hover:bg-[var(--bg)] transition-colors duration-300"
            >
              <span className="font-manrope font-extrabold text-5xl text-[var(--border)] group-hover:text-red-100 transition-colors duration-300 leading-none select-none">
                {pain.num}
              </span>
              <h3 className="font-manrope font-bold text-[var(--text)] text-xl leading-tight tracking-tight">
                {pain.title}
              </h3>
              <div className="w-8 h-0.5 bg-red-400/80 rounded-full" />
              <p className="landing-body font-manrope">
                {pain.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>

        <motion.div {...fadeUp(0.1)} className="mt-16 text-center">
          <p className="font-manrope font-bold text-[var(--text)] text-2xl mb-4 tracking-tight">
            {SITE.name} решает всё это одним инструментом
          </p>
          <ArrowDown size={20} className="text-[var(--text-subtle)] mx-auto animate-bounce" aria-hidden />
        </motion.div>
      </div>
    </section>
  );
}

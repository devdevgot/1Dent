import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { fadeUp } from "@/lib/landing-animations";
import { SITE } from "@/config/site";

const faqs = [
  {
    q: "Сколько длится бесплатный период?",
    a: "3 дня полного доступа. Карта не нужна — зарегистрируйте клинику и начните работать.",
  },
  {
    q: "Можно ли перенести данные из Excel?",
    a: `Да, в ${SITE.name} есть модуль миграции. Команда поддержки поможет с переносом пациентов.`,
  },
  {
    q: "Как работает WhatsApp?",
    a: "Подключаете номер клиники — все сообщения в едином чате. ИИ-чатбот отвечает автоматически.",
  },
  {
    q: "Безопасны ли данные?",
    a: "Каждая клиника изолирована. Врачи видят телефоны в маскированном виде — база защищена.",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="bg-white landing-section-sm px-4 sm:px-6 overflow-hidden">
      <div className="max-w-2xl mx-auto min-w-0">
        <motion.div {...fadeUp(0)} className="text-center mb-8">
          <h2 className="landing-h3 font-manrope text-[#0f172a]">
            Частые вопросы
          </h2>
        </motion.div>

        <div className="space-y-2">
          {faqs.map((faq, i) => {
            const isOpen = open === i;
            return (
              <div key={faq.q} className="landing-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 p-4 text-left font-manrope font-semibold text-sm text-[#0f172a] hover:bg-[#faf8f4] transition-colors"
                  aria-expanded={isOpen}
                >
                  {faq.q}
                  <ChevronDown size={16} className={`text-[#94a3b8] shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className="px-4 pb-4 text-sm font-manrope text-[#64748b] leading-relaxed">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

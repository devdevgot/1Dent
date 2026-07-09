import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { fadeUp } from "@/lib/landing-animations";
import { SITE } from "@/config/site";

const faqs = [
  {
    q: "Сколько длится бесплатный период?",
    a: "3 дня полного доступа ко всем функциям. Карта не нужна — просто зарегистрируйте клинику и начните работать.",
  },
  {
    q: "Можно ли перенести данные из Excel или другой CRM?",
    a: `Да. В ${SITE.name} есть модуль миграции — импортируйте пациентов и историю из таблиц. Команда поддержки поможет с переносом.`,
  },
  {
    q: "Как работает WhatsApp-интеграция?",
    a: "Подключаете номер клиники через Green API. Все входящие и исходящие сообщения — в едином чате внутри системы. ИИ-чатбот отвечает автоматически, когда администратор занят.",
  },
  {
    q: "Безопасны ли данные пациентов?",
    a: "Да. Каждая клиника изолирована, данные шифруются, есть резервные копии. Врачи видят телефоны в маскированном виде — база защищена от утечки.",
  },
  {
    q: "Поддерживается ли Kaspi?",
    a: "Да. В финансовом модуле учитываются Kaspi переводы, QR и Red — как и наличные, терминал и другие способы оплаты.",
  },
  {
    q: "Есть ли поддержка на русском?",
    a: "Да. Команда поддержки отвечает на русском и казахском. Помогаем с настройкой, миграцией и обучением сотрудников.",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-[#faf8f4] landing-section-sm px-6">
      <div className="max-w-3xl mx-auto">
        <motion.div {...fadeUp(0)} className="text-center mb-12">
          <h2 className="landing-h2 font-manrope text-[#0f172a] mb-4">
            Частые вопросы
          </h2>
          <p className="landing-lead font-manrope">
            Всё, что нужно знать перед стартом
          </p>
        </motion.div>

        <div className="space-y-3">
          {faqs.map((faq, i) => {
            const isOpen = open === i;
            return (
              <motion.div
                key={faq.q}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-20px" }}
                transition={{ delay: i * 0.05 }}
                className="landing-card overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 p-5 text-left font-manrope font-semibold text-[#0f172a] hover:bg-[#faf8f4] transition-colors"
                  aria-expanded={isOpen}
                >
                  {faq.q}
                  <ChevronDown
                    size={18}
                    className={`text-[#94a3b8] flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-5 landing-body font-manrope">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

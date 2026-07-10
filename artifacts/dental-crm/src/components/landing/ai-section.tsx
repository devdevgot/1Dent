import { motion } from "framer-motion";
import { Sparkles, MessageSquare, Send, Bell } from "lucide-react";
import { fadeUp, staggerParentVariants, EASE } from "@/lib/landing-animations";
import { SITE } from "@/config/site";

function ChatBubble({ text, from, delay }: { text: string; from: "user" | "ai"; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay, duration: 0.4, ease: EASE }}
      style={{ willChange: "transform, opacity" }}
      className={`flex ${from === "ai" ? "justify-end" : "justify-start"}`}
    >
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm font-manrope ${
        from === "ai"
          ? "bg-[var(--ds-primary)] text-white rounded-br-sm"
          : "bg-white/10 text-white/80 rounded-bl-sm border border-white/10"
      }`}>
        {text}
      </div>
    </motion.div>
  );
}

const aiFeaturesData = [
  {
    icon: MessageSquare,
    title: "ИИ-чатбот",
    desc: "Отвечает пациентам в WhatsApp автоматически 24/7. Записывает, консультирует, отвечает на вопросы.",
  },
  {
    icon: Send,
    title: "Автоответы",
    desc: "Не успели ответить — ИИ перехватит и не потеряет пациента. Каждый диалог под контролем.",
  },
  {
    icon: Bell,
    title: "Умные рассылки",
    desc: "Напоминания о записи, возврат пациентов после лечения, профилактика — всё автоматически.",
  },
];

const featureItemVariants = {
  hidden: { opacity: 0, x: -18 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: EASE },
  },
};

const statsVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE },
  },
};

export function AiSection() {
  return (
    <section className="bg-[var(--dark-bg)] landing-section-sm px-6 overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none landing-dark-grid" />
      <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full filter blur-[120px] opacity-100 pointer-events-none landing-dark-glow-blue" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full filter blur-[100px] opacity-100 pointer-events-none landing-dark-glow-purple" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <motion.div {...fadeUp(0)}>
              <div className="landing-badge landing-badge-dark font-manrope mb-8">
                <Sparkles size={14} className="text-[var(--accent-blue-light)]" />
                <span>Powered by DeepSeek V3</span>
              </div>
              <h2 className="landing-h2 font-manrope text-white leading-[0.95] mb-6">
                Искусственный
                <br />
                <span className="landing-gradient-text-dark">интеллект</span>
                <br />
                внутри.
              </h2>
              <p className="font-manrope text-[var(--dark-secondary)] text-lg leading-relaxed mb-10">
                {SITE.name} работает на ИИ. Чатбот отвечает пациентам, система напоминает, аналитика советует — пока вы занимаетесь лечением.
              </p>
            </motion.div>

            <motion.div
              variants={staggerParentVariants(0.12)}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-30px" }}
              className="space-y-5"
            >
              {aiFeaturesData.map((f, i) => (
                <motion.div
                  key={i}
                  variants={featureItemVariants}
                  style={{ willChange: "transform, opacity" }}
                  className="flex gap-4 items-start group"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--ds-primary)]/20 flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--ds-primary)]/30 transition-colors">
                    <f.icon size={18} className="text-[var(--accent-blue-light)]" />
                  </div>
                  <div>
                    <div className="font-manrope font-bold text-white text-base mb-1">{f.title}</div>
                    <div className="font-manrope text-white/50 text-sm leading-relaxed">{f.desc}</div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <motion.div {...fadeUp(0.08, 20)}>
            <div className="landing-card-dark p-6">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--dark-border)]">
                <div className="w-10 h-10 rounded-full bg-[var(--ds-primary)] flex items-center justify-center">
                  <Sparkles size={18} className="text-white" />
                </div>
                <div>
                  <div className="font-manrope font-bold text-white text-sm">{SITE.name} ИИ-Ассистент</div>
                  <div className="font-manrope text-white/50 text-xs flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
                    Онлайн 24/7
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <ChatBubble from="user" text="Здравствуйте! Хочу записаться к ортодонту" delay={0.1} />
                <ChatBubble from="ai" text="Добрый день! Конечно, помогу с записью. К какому врачу предпочитаете?" delay={0.2} />
                <ChatBubble from="user" text="К доктору Сейткали, если можно" delay={0.3} />
                <ChatBubble from="ai" text="Отлично! Ближайшее свободное время у доктора Сейткали: завтра в 10:00 или послезавтра в 14:30. Какое время удобнее?" delay={0.4} />
                <ChatBubble from="user" text="Завтра в 10:00" delay={0.5} />
                <ChatBubble from="ai" text="Записал! Завтра в 10:00. Накануне вечером придёт напоминание в WhatsApp." delay={0.6} />
              </div>

              <div className="mt-6 flex gap-2 bg-white/5 rounded-2xl p-3 border border-[var(--dark-border)]">
                <input
                  readOnly
                  placeholder="Напишите сообщение..."
                  aria-label="Сообщение"
                  className="flex-1 bg-transparent font-manrope text-white/40 text-sm outline-none placeholder:text-white/30"
                />
                <button type="button" aria-label="Отправить" className="w-8 h-8 rounded-xl bg-[var(--ds-primary)] flex items-center justify-center hover:bg-[#1a65e8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">
                  <Send size={14} className="text-white" />
                </button>
              </div>
            </div>

            <motion.div
              variants={staggerParentVariants(0.1)}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-30px" }}
              className="grid grid-cols-3 gap-4 mt-4"
            >
              {[{ value: "24/7", label: "Работает" }, { value: "< 2с", label: "Ответ" }, { value: "Авто", label: "Запись" }].map((s) => (
                <motion.div
                  key={s.label}
                  variants={statsVariants}
                  style={{ willChange: "transform, opacity" }}
                  className="landing-card-dark p-4 text-center"
                >
                  <div className="font-manrope font-bold text-white text-xl">{s.value}</div>
                  <div className="font-manrope text-white/40 text-xs mt-1">{s.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

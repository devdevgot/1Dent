import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bot, MessageSquare, Send, Bell, Sparkles } from "lucide-react";
import { fadeUp, EASE } from "@/lib/landing-animations";
import { SITE } from "@/config/site";

const CONVERSATION = [
  { role: "user" as const, text: "Здравствуйте! Хочу записаться к ортодонту" },
  { role: "bot" as const, text: "Добрый день! Помогу с записью. К какому врачу предпочитаете?" },
  { role: "user" as const, text: "К доктору Сейткали" },
  { role: "bot" as const, text: "Ближайшее время: завтра 10:00 или послезавтра 14:30. Что удобнее?" },
  { role: "user" as const, text: "Завтра в 10:00" },
  { role: "bot" as const, text: "Записал! Завтра в 10:00. Накануне придёт напоминание в WhatsApp." },
];

const QUICK_REPLIES = ["Записаться", "Цены", "Адрес клиники"];

const aiFeatures = [
  { icon: MessageSquare, title: "ИИ-чатбот", desc: "Отвечает в WhatsApp 24/7, записывает на приём." },
  { icon: Send, title: "Автоответы", desc: "Перехватывает диалог, если администратор занят." },
  { icon: Bell, title: "Умные рассылки", desc: "Напоминания и возврат пациентов автоматически." },
];

function BotBubble({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.35, ease: EASE }}
      className="flex justify-start"
    >
      <div className="h-6 w-6 rounded-full bg-[#1f75fe]/10 flex items-center justify-center shrink-0 mr-2 mt-0.5">
        <Bot className="h-3.5 w-3.5 text-[#1f75fe]" />
      </div>
      <div className="max-w-[82%] rounded-2xl rounded-tl-sm px-3 py-2 text-sm font-manrope bg-white border border-[#e8e3d9] text-[#0f172a] leading-relaxed">
        {text}
      </div>
    </motion.div>
  );
}

function UserBubble({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.35, ease: EASE }}
      className="flex justify-end"
    >
      <div className="max-w-[82%] rounded-2xl rounded-tr-sm px-3 py-2 text-sm font-manrope bg-[#1f75fe] text-white leading-relaxed">
        {text}
      </div>
    </motion.div>
  );
}

export function AiSection() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= CONVERSATION.length) return;
    const t = setTimeout(() => setVisibleCount((c) => c + 1), visibleCount === 0 ? 400 : 700);
    return () => clearTimeout(t);
  }, [visibleCount]);

  return (
    <section className="bg-[#faf8f4] landing-section-sm px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <motion.div {...fadeUp(0)}>
            <div className="landing-badge landing-badge-primary font-manrope mb-5">
              <Sparkles size={14} />
              <span>ИИ-ассистент</span>
            </div>
            <h2 className="landing-h2 font-manrope text-[#0f172a] mb-4">
              Чатбот, который ведёт пациента до записи
            </h2>
            <p className="landing-lead font-manrope mb-8">
              {SITE.name} отвечает пациентам в WhatsApp, пока вы занимаетесь лечением.
            </p>
            <div className="space-y-4">
              {aiFeatures.map((f) => (
                <div key={f.title} className="flex gap-3 items-start">
                  <div className="w-9 h-9 rounded-xl bg-[#1f75fe]/10 flex items-center justify-center shrink-0">
                    <f.icon size={16} className="text-[#1f75fe]" />
                  </div>
                  <div>
                    <p className="font-manrope font-semibold text-[#0f172a] text-sm">{f.title}</p>
                    <p className="font-manrope text-[#64748b] text-sm">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div {...fadeUp(0.08)}>
            <div className="rounded-2xl border border-[#e8e3d9] bg-white shadow-[var(--shadow-md)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e8e3d9] bg-white">
                <div className="w-8 h-8 rounded-full bg-[#1f75fe] flex items-center justify-center">
                  <Bot size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold font-manrope text-[#0f172a]">{SITE.name} ИИ</p>
                  <p className="text-[11px] text-green-600 font-manrope flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Онлайн
                  </p>
                </div>
              </div>

              <div className="px-3 py-4 space-y-3 bg-[#faf8f4] min-h-[280px] max-h-[320px] overflow-y-auto">
                {CONVERSATION.slice(0, visibleCount).map((msg, i) =>
                  msg.role === "user" ? (
                    <UserBubble key={i} text={msg.text} delay={i * 0.05} />
                  ) : (
                    <BotBubble key={i} text={msg.text} delay={i * 0.05} />
                  ),
                )}
                {visibleCount < CONVERSATION.length && (
                  <div className="flex justify-start">
                    <div className="h-6 w-6 rounded-full bg-[#1f75fe]/10 flex items-center justify-center shrink-0 mr-2">
                      <Bot className="h-3.5 w-3.5 text-[#1f75fe]" />
                    </div>
                    <div className="bg-white border border-[#e8e3d9] rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]/50 animate-bounce" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]/50 animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[#94a3b8]/50 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                )}
              </div>

              <div className="px-3 py-2 border-t border-[#e8e3d9] flex gap-1.5 flex-wrap bg-white">
                {QUICK_REPLIES.map((q) => (
                  <span key={q} className="text-[11px] font-manrope px-2.5 py-1 rounded-full border border-[#e8e3d9] text-[#64748b] bg-[#faf8f4]">
                    {q}
                  </span>
                ))}
              </div>

              <div className="px-3 py-2.5 border-t border-[#e8e3d9] bg-white flex gap-2">
                <input
                  readOnly
                  placeholder="Напишите как пациент..."
                  aria-label="Сообщение"
                  className="flex-1 text-sm border border-[#e8e3d9] rounded-xl px-3 py-2 bg-white font-manrope text-[#94a3b8]"
                />
                <button type="button" aria-label="Отправить" className="w-9 h-9 bg-[#1f75fe] text-white rounded-xl flex items-center justify-center shrink-0">
                  <Send size={14} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4">
              {[{ value: "24/7", label: "Работает" }, { value: "< 2с", label: "Ответ" }, { value: "Авто", label: "Запись" }].map((s) => (
                <div key={s.label} className="landing-card p-3 text-center">
                  <p className="font-manrope font-bold text-[#0f172a] text-lg">{s.value}</p>
                  <p className="font-manrope text-[#94a3b8] text-xs">{s.label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

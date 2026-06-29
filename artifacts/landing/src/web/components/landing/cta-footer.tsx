import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Send, Rocket, CheckCircle } from "lucide-react";
import { FaWhatsapp, FaTelegram } from "react-icons/fa";
import { fadeUp, staggerParentVariants, staggerChildVariants } from "../../lib/animations";

export function CtaFooter() {
  const [form, setForm] = useState({ name: "", phone: "", clinic: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <>
      {/* CTA Section */}
      <section id="contact" className="bg-[#0f172a] py-24 px-6 relative overflow-hidden">
        {/* Glows */}
        <div className="absolute top-0 left-1/3 w-96 h-96 bg-[#1f75fe] rounded-full filter blur-[140px] opacity-8" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-500 rounded-full filter blur-[120px] opacity-6" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left */}
            <motion.div
              {...fadeUp(0)}
              style={{ willChange: "transform, opacity" }}
            >
              <div className="inline-flex items-center gap-2 bg-white/10 text-white/70 rounded-full px-4 py-2 text-sm font-manrope font-medium mb-8">
                <Rocket size={14} />
                <span>Начните сегодня</span>
              </div>

              <h2
                className="font-manrope font-extrabold text-white leading-[0.95] mb-6"
                style={{ fontSize: "clamp(40px, 5.5vw, 72px)" }}
              >
                Готовы изменить
                <br />
                <span className="text-[#60a5fa]">свою клинику?</span>
              </h2>

              <p className="font-manrope text-white/60 text-lg leading-relaxed mb-10">
                14 дней бесплатно. Без карты. Личная онбординг-сессия с командой 1Dent.
              </p>

              {/* Contact buttons — stagger */}
              <motion.div
                variants={staggerParentVariants(0.1)}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-30px" }}
                className="flex flex-wrap gap-4"
              >
                {[
                  {
                    href: "https://wa.me/77071234567",
                    bg: "#25d366",
                    icon: <FaWhatsapp size={20} />,
                    label: "WhatsApp",
                  },
                  {
                    href: "https://t.me/onedent_kz",
                    bg: "#2481cc",
                    icon: <FaTelegram size={20} />,
                    label: "Telegram",
                  },
                ].map((btn) => (
                  <motion.a
                    key={btn.label}
                    href={btn.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    variants={staggerChildVariants}
                    style={{ willChange: "transform, opacity", backgroundColor: btn.bg }}
                    whileHover={{ scale: 1.05 }}
                    className="flex items-center gap-3 text-white font-manrope font-semibold px-6 py-3.5 rounded-full transition-colors"
                  >
                    {btn.icon}
                    <span>{btn.label}</span>
                  </motion.a>
                ))}
              </motion.div>
            </motion.div>

            {/* Right: Form */}
            <motion.div
              {...fadeUp(0.08)}
              style={{ willChange: "transform, opacity" }}
            >
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-sm">
                {submitted ? (
                  <div className="text-center py-8">
                    <CheckCircle size={48} className="text-green-400 mx-auto mb-4" />
                    <h3 className="font-manrope font-bold text-white text-2xl mb-3">
                      Заявка отправлена!
                    </h3>
                    <p className="font-manrope text-white/60">
                      Мы свяжемся с вами в течение 24 часов.
                    </p>
                  </div>
                ) : (
                  <>
                    <h3 className="font-manrope font-bold text-white text-xl mb-2">
                      Оставить заявку
                    </h3>
                    <p className="font-manrope text-white/50 text-sm mb-6">
                      Заполните форму и мы свяжемся с вами
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <input
                        type="text"
                        placeholder="Ваше имя"
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 font-manrope text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-[#1f75fe]/50 transition-colors"
                      />
                      <input
                        type="tel"
                        placeholder="Номер телефона"
                        required
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 font-manrope text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-[#1f75fe]/50 transition-colors"
                      />
                      <input
                        type="text"
                        placeholder="Название клиники"
                        required
                        value={form.clinic}
                        onChange={(e) => setForm({ ...form, clinic: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 font-manrope text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-[#1f75fe]/50 transition-colors"
                      />
                      <button
                        type="submit"
                        className="w-full bg-[#1f75fe] hover:bg-[#1a65e8] text-white font-manrope font-semibold py-4 rounded-2xl transition-all hover:scale-105 flex items-center justify-center gap-2"
                      >
                        Получить демо
                        <ArrowRight size={18} />
                      </button>
                    </form>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#faf8f4] border-t border-[#e8e3d9] px-6 py-10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6">
          {/* Logo */}
          <a href="#" className="flex items-center">
            <img src="/logo_clean.png" alt="1Dent" className="h-10 w-auto" />
          </a>

          <p className="font-manrope text-[#94a3b8] text-sm text-center">
            © 2025 1Dent. Dental CRM для стоматологий Казахстана.
          </p>

          <div className="flex gap-4">
            <a href="https://wa.me/77071234567" target="_blank" rel="noopener noreferrer"
              className="w-9 h-9 rounded-full bg-[#e8e3d9] flex items-center justify-center text-[#64748b] hover:text-[#0f172a] hover:bg-[#e0dbd0] transition-colors">
              <FaWhatsapp size={16} />
            </a>
            <a href="https://t.me/onedent_kz" target="_blank" rel="noopener noreferrer"
              className="w-9 h-9 rounded-full bg-[#e8e3d9] flex items-center justify-center text-[#64748b] hover:text-[#0f172a] hover:bg-[#e0dbd0] transition-colors">
              <FaTelegram size={16} />
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}

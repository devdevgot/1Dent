import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Rocket } from "lucide-react";
import { FaWhatsapp, FaTelegram } from "react-icons/fa";
import { Link } from "wouter";
import { fadeUp, staggerParentVariants, staggerChildVariants } from "@/lib/landing-animations";
import { SITE } from "@/config/site";

export function CtaFooter() {
  const [form, setForm] = useState({ name: "", phone: "", clinic: "" });

  return (
    <>
      <section id="contact" className="bg-[var(--dark-bg)] landing-section-sm px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none landing-dark-grid" />
        <div className="absolute top-0 left-1/3 w-96 h-96 rounded-full filter blur-[140px] opacity-100 pointer-events-none landing-dark-glow-blue" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full filter blur-[120px] opacity-100 pointer-events-none landing-dark-glow-purple" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div {...fadeUp(0)} style={{ willChange: "transform, opacity" }}>
              <div className="landing-badge landing-badge-dark font-manrope mb-8">
                <Rocket size={14} />
                <span>Начните сегодня</span>
              </div>

              <h2 className="landing-h2 font-manrope text-white leading-[0.95] mb-6">
                Готовы изменить
                <br />
                <span className="landing-gradient-text-dark">свою клинику?</span>
              </h2>

              <p className="font-manrope text-[var(--dark-secondary)] text-lg leading-relaxed mb-10">
                14 дней бесплатно. Без карты. Личная онбординг-сессия с командой {SITE.name}.
              </p>

              <Link
                href="/register"
                className="landing-btn landing-btn-accent font-manrope mb-8"
              >
                Создать клинику бесплатно
                <ArrowRight size={18} />
              </Link>

              <motion.div
                variants={staggerParentVariants(0.1)}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-30px" }}
                className="flex flex-wrap gap-3"
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
                    whileHover={{ scale: 1.03 }}
                    className="flex items-center gap-3 text-white font-manrope font-semibold px-6 py-3.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    {btn.icon}
                    <span>{btn.label}</span>
                  </motion.a>
                ))}
              </motion.div>
            </motion.div>

            <motion.div {...fadeUp(0.08)} style={{ willChange: "transform, opacity" }}>
              <div className="landing-card-dark p-8">
                <h3 className="font-manrope font-bold text-white text-xl mb-2 tracking-tight">
                  Оставить заявку
                </h3>
                <p className="font-manrope text-white/50 text-sm mb-6">
                  Заполните форму или сразу создайте клинику
                </p>

                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Ваше имя"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="landing-input-dark font-manrope"
                  />
                  <input
                    type="tel"
                    placeholder="Номер телефона"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="landing-input-dark font-manrope"
                  />
                  <input
                    type="text"
                    placeholder="Название клиники"
                    required
                    value={form.clinic}
                    onChange={(e) => setForm({ ...form, clinic: e.target.value })}
                    className="landing-input-dark font-manrope"
                  />
                  <Link
                    href="/register"
                    className="landing-btn landing-btn-accent w-full font-manrope"
                  >
                    Получить демо
                    <ArrowRight size={18} />
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <footer className="bg-[var(--bg)] border-t border-[var(--ds-border)] px-6 py-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6">
          <Link href="/" className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)] rounded-lg">
            <img src="/logo_clean.png" alt={SITE.name} className="h-9 w-auto" />
          </Link>

          <p className="font-manrope text-[var(--text-subtle)] text-sm text-center">
            © 2025 {SITE.name}. Dental CRM для стоматологий Казахстана.
          </p>

          <div className="flex gap-3">
            <a
              href="https://wa.me/77071234567"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className="w-10 h-10 rounded-full bg-[var(--ds-border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]"
            >
              <FaWhatsapp size={16} />
            </a>
            <a
              href="https://t.me/onedent_kz"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram"
              className="w-10 h-10 rounded-full bg-[var(--ds-border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]"
            >
              <FaTelegram size={16} />
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}

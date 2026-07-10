import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Link } from "wouter";
import { SITE } from "@/config/site";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const links = [
    { label: "Возможности", href: "#features" },
    { label: "Тарифы", href: "#pricing" },
    { label: "Контакты", href: "#contact" },
  ];

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={`landing-nav fixed top-0 left-0 right-0 z-50 ${
        scrolled ? "landing-nav-scrolled" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)] focus-visible:ring-offset-2 rounded-lg">
          <img src="/logo_clean.png" alt={SITE.name} className="h-9 w-auto" />
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="landing-nav-link font-manrope"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="landing-btn landing-btn-ghost font-manrope">
            Войти
          </Link>
          <Link href="/register" className="landing-btn landing-btn-accent font-manrope">
            Начать бесплатно
          </Link>
        </div>

        <button
          type="button"
          aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={menuOpen}
          className="md:hidden p-2 rounded-xl hover:bg-[#f1ede4] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-[#faf8f4] border-t border-[#e8e3d9] px-6 py-6 flex flex-col gap-2"
          >
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="font-manrope text-[#0f172a] font-medium py-3 border-b border-[#e8e3d9] last:border-0"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="landing-btn landing-btn-ghost font-manrope text-center mt-4"
            >
              Войти
            </Link>
            <Link
              href="/register"
              onClick={() => setMenuOpen(false)}
              className="landing-btn landing-btn-accent font-manrope text-center"
            >
              Начать бесплатно
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

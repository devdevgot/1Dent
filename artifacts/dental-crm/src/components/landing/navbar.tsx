import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Link } from "wouter";

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
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-[#faf8f4]/90 backdrop-blur-md shadow-sm border-b border-[#e8e3d9]" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <img src="/logo_clean.png" alt="1Dent" className="h-10 w-auto" />
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-manrope text-[#64748b] hover:text-[#0f172a] transition-colors text-sm font-medium"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/login"
            className="font-manrope text-sm font-semibold text-[#0f172a] px-5 py-2.5 rounded-full border border-[#e8e3d9] hover:bg-[#f1ede4] transition-colors"
          >
            Войти
          </Link>
          <Link
            href="/register"
            className="font-manrope text-sm font-semibold text-white bg-[#1f75fe] px-5 py-2.5 rounded-full hover:bg-[#1a65e8] transition-all hover:scale-105"
          >
            Начать бесплатно
          </Link>
        </div>

        {/* Burger */}
        <button
          className="md:hidden p-2 rounded-xl hover:bg-[#f1ede4] transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-[#faf8f4] border-t border-[#e8e3d9] px-6 py-4 flex flex-col gap-4"
          >
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="font-manrope text-[#0f172a] font-medium py-2"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="font-manrope text-sm font-semibold text-[#0f172a] px-5 py-3 rounded-full text-center border border-[#e8e3d9] mt-2"
            >
              Войти
            </Link>
            <Link
              href="/register"
              onClick={() => setMenuOpen(false)}
              className="font-manrope text-sm font-semibold text-white bg-[#1f75fe] px-5 py-3 rounded-full text-center"
            >
              Начать бесплатно
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

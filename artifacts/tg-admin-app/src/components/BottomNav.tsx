import { useNavigate, useLocation } from "react-router-dom";
import { haptic } from "../hooks/useTgBackButton";

const tabs = [
  { path: "/", label: "Обзор", icon: "📊" },
  { path: "/clinics", label: "Клиники", icon: "🏥" },
  { path: "/content", label: "Контент", icon: "📦" },
  { path: "/plan-requests", label: "Заявки", icon: "📋" },
  { path: "/more", label: "Ещё", icon: "☰" },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const active = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t border-border z-50 shadow-[0_-4px_20px_rgba(15,23,42,0.06)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex">
        {tabs.map((t) => (
          <button
            key={t.path}
            type="button"
            onClick={() => { haptic("light"); navigate(t.path); }}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 px-1 transition-colors ${
              active(t.path) ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <span className="text-xl leading-none">{t.icon}</span>
            <span className="text-[10px] font-semibold leading-none">{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

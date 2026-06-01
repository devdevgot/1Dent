import { useNavigate, useLocation } from "react-router-dom";
import { haptic } from "../hooks/useTgBackButton";

const tabs = [
  { path: "/", label: "Обзор", icon: "📊" },
  { path: "/clinics", label: "Клиники", icon: "🏥" },
  { path: "/activity", label: "Активность", icon: "💬" },
  { path: "/logs", label: "Логи", icon: "📋" },
  { path: "/admins", label: "Админы", icon: "👤" },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const active = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex">
        {tabs.map((t) => (
          <button
            key={t.path}
            onClick={() => { haptic("light"); navigate(t.path); }}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 px-1 transition-colors ${active(t.path) ? "text-primary" : "text-muted-foreground"}`}
          >
            <span className="text-xl leading-none">{t.icon}</span>
            <span className="text-[10px] font-medium leading-none">{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

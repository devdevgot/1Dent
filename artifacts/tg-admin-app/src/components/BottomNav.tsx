import { useNavigate, useLocation } from "react-router-dom";
import { haptic } from "../hooks/useTgBackButton";
import { SectionIcon, type SectionIconName } from "./section-icons";
import { cn } from "@/lib/utils";

const tabs: { path: string; label: string; icon: SectionIconName }[] = [
  { path: "/", label: "Обзор", icon: "dashboard" },
  { path: "/clinics", label: "Клиники", icon: "clinics" },
  { path: "/content", label: "Контент", icon: "content" },
  { path: "/plan-requests", label: "Заявки", icon: "plan-requests" },
  { path: "/more", label: "Ещё", icon: "more" },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const active = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-[#e8e3d9] z-50 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] safe-bottom"
    >
      <div className="flex">
        {tabs.map((t) => {
          const isActive = active(t.path);
          return (
            <button
              key={t.path}
              type="button"
              onClick={() => { haptic("light"); navigate(t.path); }}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2.5 px-1 transition-colors",
                isActive ? "text-[#1f75fe]" : "text-[#94a3b8]",
              )}
            >
              <SectionIcon name={t.icon} className="w-5 h-5" strokeWidth={isActive ? 2.25 : 2} />
              <span className="text-[10px] font-semibold leading-none">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

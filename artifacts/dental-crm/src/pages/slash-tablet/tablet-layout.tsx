import { useLocation } from "wouter";
import { LogOut, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { OneDentLogo } from "./onedent-logo";
import { CABINET, initials } from "./mock-data";
import { getTabletNav } from "./tablet-nav";
import type { TabletSession } from "./tablet-session";
import { clearCabinetSession } from "./tablet-session";

export function TabletLayout({
  session,
  children,
  onLogout,
}: {
  session: TabletSession;
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const [location, navigate] = useLocation();
  const nav = getTabletNav(session.role);

  const handleLogout = () => {
    if (session.mode === "cabinet") clearCabinetSession();
    onLogout();
  };

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#faf8f4] font-manrope">
      {/* Боковая навигация — landscape tablet */}
      <aside className="flex w-[72px] shrink-0 flex-col border-r border-[#e8e3d9] bg-white lg:w-56">
        <div className="flex items-center justify-center border-b border-[#e8e3d9] px-3 py-4 lg:justify-start lg:px-4">
          <OneDentLogo className="h-8 lg:h-9" />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {nav.map((item) => {
            const active = location === item.path || location.startsWith(item.path + "/");
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors",
                  active
                    ? "bg-[#1f75fe]/10 text-[#1f75fe]"
                    : "text-[#64748b] hover:bg-[#faf8f4] hover:text-[#0f172a]",
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="hidden lg:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[#e8e3d9] p-2">
          {session.mode === "crm" && (
            <button
              type="button"
              onClick={() => navigate(session.role === "owner" ? "/dashboard" : session.role === "admin" ? "/dashboard/admin" : "/dashboard/doctor")}
              className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#64748b] hover:bg-[#faf8f4]"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">Полный CRM</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#64748b] hover:bg-[#fef2f2] hover:text-[#dc2626]"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Выход</span>
          </button>
        </div>
      </aside>

      {/* Контент */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-[#e8e3d9] bg-white px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="hidden text-sm text-[#64748b] sm:inline">{CABINET.name}</span>
            {session.mode === "cabinet" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                Кабинет
              </span>
            )}
            {session.role === "owner" && (
              <span className="rounded-full bg-[#7c3aed]/10 px-2 py-0.5 text-[10px] font-bold text-[#7c3aed]">
                Владелец
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: session.doctor.avatarColor }}
            >
              {initials(session.doctor.name)}
            </div>
            <p className="hidden text-sm font-bold text-[#0f172a] sm:block">{session.doctor.name}</p>
          </div>
        </header>
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

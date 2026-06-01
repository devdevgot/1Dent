type Tab = "dashboard" | "clinics" | "activity" | "logs" | "settings";

interface Props {
  tab: Tab;
  setTab: (t: Tab) => void;
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Обзор", icon: "📊" },
  { id: "clinics", label: "Клиники", icon: "🏥" },
  { id: "activity", label: "Активность", icon: "💬" },
  { id: "logs", label: "Логи", icon: "📋" },
  { id: "settings", label: "Настройки", icon: "⚙️" },
];

export default function BottomNav({ tab, setTab }: Props) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-bottom z-50">
      <div className="flex">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 transition-colors ${
              tab === t.id
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="text-xl leading-none">{t.icon}</span>
            <span className="text-[10px] font-medium leading-none">{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

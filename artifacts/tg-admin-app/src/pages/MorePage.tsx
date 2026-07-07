import { useNavigate } from "react-router-dom";
import { haptic } from "../hooks/useTgBackButton";

const links = [
  { path: "/activity", icon: "💬", title: "Активность чатботов", desc: "Сессии и сообщения по клиникам" },
  { path: "/settings", icon: "⚙️", title: "Настройки платформы", desc: "Админы, бот, интеграции" },
  { path: "/errors", icon: "🚨", title: "Ошибки системы", desc: "Инциденты API и CRM" },
  { path: "/logs", icon: "📋", title: "Журнал действий", desc: "Логи по всем клиникам" },
];

export default function MorePage() {
  const navigate = useNavigate();

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Ещё</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Мониторинг и настройки платформы</p>
      </div>

      <div className="space-y-2">
        {links.map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => { haptic("light"); navigate(item.path); }}
            className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm active:scale-[0.99] transition-transform"
          >
            <span className="text-2xl">{item.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </div>
            <span className="ml-auto text-muted-foreground">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

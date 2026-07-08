import { useNavigate } from "react-router-dom";
import { haptic } from "../hooks/useTgBackButton";

const items = [
  {
    path: "/tablet",
    icon: "🎬",
    title: "Видео планшета",
    desc: "Ролики по кариесу, пульпиту, гигиене и др.",
  },
  {
    path: "/platform/plans",
    icon: "💳",
    title: "Тарифы",
    desc: "Цены, лимиты и условия подписок",
  },
  {
    path: "/platform/contracts",
    icon: "📝",
    title: "Шаблоны договоров",
    desc: "Системные шаблоны и пересев по клиникам",
  },
  {
    path: "/platform/chatbot",
    icon: "🤖",
    title: "Чатбот (глобально)",
    desc: "Приветствие и follow-up для новых клиник",
  },
  {
    path: "/platform/whatsapp",
    icon: "📱",
    title: "WhatsApp 1Dent",
    desc: "Системные инстансы для OTP и приглашений",
  },
];

export default function ContentHubPage() {
  const navigate = useNavigate();

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Контент платформы</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Управление тарифами, договорами, чатботом и видео
        </p>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
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

import { useNavigate } from "react-router-dom";
import { haptic } from "../hooks/useTgBackButton";
import { TmaPage } from "@/components/layout/tma-page";
import { IosGroup, IosGroupRow, IosSection } from "@/components/layout/ios-group";
import { SectionIconBox, type SectionIconName } from "@/components/section-icons";

const items: { path: string; icon: SectionIconName; title: string; desc: string }[] = [
  { path: "/tablet", icon: "tablet", title: "Видео планшета", desc: "Ролики по кариесу, пульпиту, гигиене и др." },
  { path: "/platform/plans", icon: "plans", title: "Тарифы", desc: "Цены, лимиты и условия подписок" },
  { path: "/platform/contracts", icon: "contracts", title: "Шаблоны договоров", desc: "Системные шаблоны и пересев по клиникам" },
  { path: "/platform/chatbot", icon: "chatbot", title: "Чатбот (глобально)", desc: "Приветствие и follow-up для новых клиник" },
  { path: "/platform/whatsapp", icon: "whatsapp", title: "WhatsApp 1Dent", desc: "Системные инстансы для OTP и приглашений" },
];

export default function ContentHubPage() {
  const navigate = useNavigate();

  return (
    <TmaPage
      title="Контент платформы"
      subtitle="Тарифы, договоры, чатбот и видео"
      withTabBarOffset
    >
      <IosSection>
        <IosGroup>
          {items.map((item) => (
            <IosGroupRow
              key={item.path}
              as="button"
              showChevron
              onClick={() => { haptic("light"); navigate(item.path); }}
            >
              <SectionIconBox name={item.icon} />
              <div className="min-w-0 text-left">
                <p className="text-sm font-semibold text-[#0f172a]">{item.title}</p>
                <p className="text-xs text-[#64748b] mt-0.5">{item.desc}</p>
              </div>
            </IosGroupRow>
          ))}
        </IosGroup>
      </IosSection>
    </TmaPage>
  );
}

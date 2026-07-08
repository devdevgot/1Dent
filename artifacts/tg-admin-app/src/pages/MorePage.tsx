import { useNavigate } from "react-router-dom";
import { haptic } from "../hooks/useTgBackButton";
import { TmaPage } from "@/components/layout/tma-page";
import { IosGroup, IosGroupRow, IosSection } from "@/components/layout/ios-group";
import { SectionIconBox, type SectionIconName } from "@/components/section-icons";

const links: { path: string; icon: SectionIconName; title: string; desc: string }[] = [
  { path: "/activity", icon: "activity", title: "Активность чатботов", desc: "Сессии и сообщения по клиникам" },
  { path: "/settings", icon: "settings", title: "Настройки платформы", desc: "Админы, бот, интеграции" },
  { path: "/errors", icon: "errors", title: "Ошибки системы", desc: "Инциденты API и CRM" },
  { path: "/logs", icon: "logs", title: "Журнал действий", desc: "Логи по всем клиникам" },
];

export default function MorePage() {
  const navigate = useNavigate();

  return (
    <TmaPage
      title="Ещё"
      subtitle="Мониторинг и настройки платформы"
      withTabBarOffset
    >
      <IosSection>
        <IosGroup>
          {links.map((item) => (
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

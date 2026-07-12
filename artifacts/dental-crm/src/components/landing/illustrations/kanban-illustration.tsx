import {
  FloatingBadge,
  IllustrationCanvas,
  IllustrationCard,
  IllustrationCheckbox,
  IllustrationTag,
} from "./illustration-primitives";

const COLUMNS = [
  {
    title: "Новая заявка",
    cards: [
      { name: "Асель Нурова", tag: "WhatsApp" },
      { name: "Данияр К.", tag: "Instagram" },
    ],
  },
  {
    title: "Консультация",
    cards: [{ name: "Мадина Сейтова", tag: "2GIS" }],
  },
  {
    title: "Диагностика",
    cards: [{ name: "Серик А.", tag: "Сайт" }],
  },
];

export function KanbanIllustration() {
  return (
    <IllustrationCanvas>
      <FloatingBadge className="left-[4%] top-[12%]" variant="muted">
        Repeat sale
      </FloatingBadge>
      <FloatingBadge className="left-[2%] top-[38%]" variant="solid">
        Записан
      </FloatingBadge>
      <FloatingBadge className="left-[6%] bottom-[18%]">
        Лечение
      </FloatingBadge>

      <FloatingBadge className="right-[3%] top-[16%]">
        WhatsApp
      </FloatingBadge>
      <FloatingBadge className="right-[1%] top-[42%]" variant="solid">
        Instagram
      </FloatingBadge>
      <FloatingBadge className="right-[5%] bottom-[20%]" variant="muted">
        2GIS
      </FloatingBadge>

      <div className="landing-illustration-kanban-board">
        {COLUMNS.map((column) => (
          <div key={column.title} className="landing-illustration-kanban-column">
            <p className="landing-illustration-kanban-column-title">{column.title}</p>
            <div className="space-y-2">
              {column.cards.map((card) => (
                <IllustrationCard key={card.name}>
                  <div className="flex items-start gap-2">
                    <IllustrationCheckbox />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-[#0f172a] truncate">{card.name}</p>
                      <IllustrationTag tone="blue">{card.tag}</IllustrationTag>
                    </div>
                  </div>
                </IllustrationCard>
              ))}
            </div>
          </div>
        ))}
      </div>
    </IllustrationCanvas>
  );
}

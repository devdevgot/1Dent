import {
  FloatingBadge,
  IllustrationCanvas,
  IllustrationCard,
} from "./illustration-primitives";

const TEETH = [
  { n: 11, tone: "bg-[#dbeafe]" },
  { n: 12, tone: "bg-[#fecaca]" },
  { n: 13, tone: "bg-white" },
  { n: 14, tone: "bg-white" },
  { n: 21, tone: "bg-[#bbf7d0]" },
  { n: 22, tone: "bg-white" },
  { n: 23, tone: "bg-[#fde68a]" },
  { n: 24, tone: "bg-white" },
];

export function DentalChartIllustration() {
  return (
    <IllustrationCanvas>
      <FloatingBadge className="left-[4%] top-[16%]" variant="solid">
        Коронка
      </FloatingBadge>
      <FloatingBadge className="left-[7%] bottom-[18%]">Кариес</FloatingBadge>
      <FloatingBadge className="right-[5%] top-[20%]" variant="muted">
        Имплант
      </FloatingBadge>
      <FloatingBadge className="right-[3%] bottom-[16%]" variant="solid">
        Лечение
      </FloatingBadge>

      <IllustrationCard className="absolute left-1/2 top-1/2 w-[72%] -translate-x-1/2 -translate-y-1/2 p-4">
        <p className="text-[10px] font-semibold text-[#1f75fe] mb-3 text-center">FDI зубная карта</p>
        <div className="grid grid-cols-4 gap-2">
          {TEETH.map((tooth) => (
            <div
              key={tooth.n}
              className={`aspect-square rounded-xl border border-[#e8e3d9] flex items-center justify-center text-[10px] font-bold text-[#475569] ${tooth.tone}`}
            >
              {tooth.n}
            </div>
          ))}
        </div>
      </IllustrationCard>
    </IllustrationCanvas>
  );
}

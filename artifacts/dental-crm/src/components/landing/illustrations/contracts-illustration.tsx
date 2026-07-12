import { CheckCircle } from "lucide-react";
import {
  FloatingBadge,
  IllustrationCanvas,
  IllustrationCard,
} from "./illustration-primitives";

const ROWS = [
  { name: "Асель Н.", proc: "Имплантация", signed: true },
  { name: "Данияр К.", proc: "Ортодонтия", signed: false },
  { name: "Мадина С.", proc: "Протезирование", signed: true },
];

export function ContractsIllustration() {
  return (
    <IllustrationCanvas>
      <FloatingBadge className="left-[5%] top-[14%]" variant="solid">
        Подписан
      </FloatingBadge>
      <FloatingBadge className="right-[4%] top-[18%]" variant="muted">
        Ожидает
      </FloatingBadge>
      <FloatingBadge className="right-[6%] bottom-[14%]">
        Автозаполнение
      </FloatingBadge>

      <IllustrationCard className="absolute left-1/2 top-1/2 w-[84%] -translate-x-1/2 -translate-y-1/2 p-3">
        <p className="text-[10px] font-semibold text-[#1f75fe] mb-2">Договоры пациентов</p>
        <div className="space-y-1.5">
          {ROWS.map((row) => (
            <div
              key={row.name}
              className="flex items-center justify-between gap-2 rounded-xl border border-[#e8e3d9] px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-[#0f172a] truncate">{row.name}</p>
                <p className="text-[9px] text-[#64748b] truncate">{row.proc}</p>
              </div>
              <span
                className={`inline-flex items-center gap-0.5 text-[9px] font-semibold shrink-0 ${
                  row.signed ? "text-[#1f75fe]" : "text-[#b45309]"
                }`}
              >
                {row.signed ? <CheckCircle className="w-3 h-3" /> : null}
                {row.signed ? "Подписан" : "Ожидает"}
              </span>
            </div>
          ))}
        </div>
      </IllustrationCard>
    </IllustrationCanvas>
  );
}

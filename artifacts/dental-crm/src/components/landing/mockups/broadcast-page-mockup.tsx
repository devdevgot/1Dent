import { Megaphone } from "lucide-react";
import { PagePreviewFrame } from "./page-preview-frame";

export function BroadcastPageMockup() {
  return (
    <PagePreviewFrame title="ИИ Рассылка">
      <div className="p-3 bg-white min-h-[220px] space-y-2">
        <div className="flex items-center gap-2 p-2 rounded-xl bg-[#faf8f4] border border-[#e8e3d9]">
          <div className="w-8 h-8 rounded-lg bg-[#1f75fe]/10 flex items-center justify-center">
            <Megaphone size={14} className="text-[#1f75fe]" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[#0f172a]">Повторная продажа</p>
            <p className="text-[9px] text-[#64748b]">После завершения лечения</p>
          </div>
          <span className="ml-auto text-[9px] font-bold text-green-600">Активна</span>
        </div>
        <div className="rounded-xl border border-[#e8e3d9] p-2.5 text-[10px] text-[#0f172a] leading-relaxed bg-[#faf8f4]">
          Здравствуйте! Прошло 6 месяцев после лечения. Рекомендуем профилактический осмотр. Записаться?
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Отправлено", value: "142" },
            { label: "Ответили", value: "38" },
            { label: "Записались", value: "12" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-[#faf8f4] p-2">
              <p className="text-sm font-bold text-[#0f172a]">{s.value}</p>
              <p className="text-[8px] text-[#94a3b8]">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </PagePreviewFrame>
  );
}

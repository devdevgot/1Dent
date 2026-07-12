import { PagePreviewFrame } from "./page-preview-frame";

export function BroadcastPageMockup() {
  return (
    <PagePreviewFrame title="ИИ Рассылка">
      <div className="p-5 bg-white min-h-[240px] space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#0f172a]">Повторная продажа</p>
            <p className="text-xs text-[#64748b] mt-0.5">После завершения лечения</p>
          </div>
          <span className="text-xs font-semibold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
            Активна
          </span>
        </div>

        <div className="rounded-xl border border-[#e8e3d9] p-4 text-xs text-[#475569] leading-relaxed bg-[#faf8f4]">
          Здравствуйте! Прошло 6 месяцев после лечения. Рекомендуем профилактический осмотр. Записаться?
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Отправлено", value: "142" },
            { label: "Ответили", value: "38" },
            { label: "Записались", value: "12" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-[#e8e3d9] p-3 text-center bg-white">
              <p className="text-lg font-bold text-[#0f172a]">{s.value}</p>
              <p className="text-[10px] text-[#94a3b8] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </PagePreviewFrame>
  );
}

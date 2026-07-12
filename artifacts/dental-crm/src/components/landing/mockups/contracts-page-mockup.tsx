import { CheckCircle } from "lucide-react";
import { PagePreviewFrame } from "./page-preview-frame";

export function ContractsPageMockup() {
  return (
    <PagePreviewFrame title="Договоры">
      <div className="landing-mockup-scroll p-5 bg-white min-h-[240px]">
        <table className="w-full min-w-[240px] text-[10px]">
          <thead>
            <tr className="text-[#94a3b8] border-b border-[#e8e3d9]">
              <th className="text-left py-1.5 font-medium">Пациент</th>
              <th className="text-left py-1.5 font-medium">Процедура</th>
              <th className="text-right py-1.5 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: "Асель Н.", proc: "Имплантация", signed: true },
              { name: "Данияр К.", proc: "Ортодонтия", signed: false },
            ].map((row) => (
              <tr key={row.name} className="border-b border-[#e8e3d9]/60 last:border-0">
                <td className="py-2 font-medium text-[#0f172a]">{row.name}</td>
                <td className="py-2 text-[#64748b]">{row.proc}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  {row.signed ? (
                    <span className="inline-flex items-center gap-0.5 text-green-600 font-semibold">
                      <CheckCircle size={10} /> Подписан
                    </span>
                  ) : (
                    <span className="text-amber-600 font-semibold">Ожидает</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PagePreviewFrame>
  );
}

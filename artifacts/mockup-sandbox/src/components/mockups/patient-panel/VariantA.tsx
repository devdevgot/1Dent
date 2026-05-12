import { useState } from "react";

// ── Tooth types ──────────────────────────────────────────────────────────────
type ToothType = "incisor" | "canine" | "premolar" | "molar";
function toothType(fdi: number): ToothType {
  const n = fdi % 10;
  if (n === 1 || n === 2) return "incisor";
  if (n === 3) return "canine";
  if (n === 4 || n === 5) return "premolar";
  return "molar";
}

// ── Conditions ───────────────────────────────────────────────────────────────
const CONDS: Record<string, { dot: string; label: string }> = {
  healthy:           { dot: "transparent", label: "Здоров" },
  treatment:         { dot: "#3b82f6",     label: "Лечение" },
  extraction:        { dot: "#ef4444",     label: "Удаление" },
  implant:           { dot: "#22c55e",     label: "Имплантация" },
  crown:             { dot: "#eab308",     label: "Коронка/Протез" },
  problem:           { dot: "#f97316",     label: "Проблемная зона" },
};

const MOCK: Record<number, string> = {
  16: "crown", 26: "crown",
  36: "treatment", 46: "problem",
  11: "treatment", 21: "treatment",
  48: "extraction", 18: "extraction",
  44: "extraction", 45: "problem",
};

const UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

// ── Single tooth SVG ─────────────────────────────────────────────────────────
function Tooth({ fdi, upper }: { fdi: number; upper: boolean }) {
  const type = toothType(fdi);
  const cond = MOCK[fdi] ?? "healthy";
  const { dot } = CONDS[cond]!;
  const hasDot = dot !== "transparent";

  const W = 14, H = 28;
  const crownH = type === "molar" ? 13 : type === "premolar" ? 13 : 12;
  const rootH  = H - crownH;

  // crown widths
  const cw = type === "molar" ? 13 : type === "premolar" ? 11 : 9;
  const cx = (W - cw) / 2;

  // crown path (upper: crown at bottom; lower: crown at top)
  const crownY = upper ? H - crownH : 0;
  const crownPath = `M${cx},${crownY} Q${cx-1},${crownY + crownH / 2} ${cx},${crownY + crownH} `
    + `L${cx + cw},${crownY + crownH} Q${cx + cw + 1},${crownY + crownH / 2} ${cx + cw},${crownY} Z`;

  // root(s) path
  const numRoots = type === "molar" ? 3 : type === "premolar" ? 2 : 1;
  const rootPaths: string[] = [];
  const rootW = numRoots === 1 ? 5 : numRoots === 2 ? 4 : 3;
  const spread = numRoots === 1 ? 0 : numRoots === 2 ? 3 : 4.5;
  const centers = numRoots === 1
    ? [W / 2]
    : numRoots === 2
    ? [W / 2 - spread / 2, W / 2 + spread / 2]
    : [W / 2 - spread, W / 2, W / 2 + spread];

  centers.forEach((rcx) => {
    const rTopY = upper ? 0 : crownH;
    const rBotY = upper ? rootH : H;
    // Slightly taper the root
    const halfW = rootW / 2;
    const tipW  = halfW * 0.3;
    if (upper) {
      // root goes upward → taper toward top
      rootPaths.push(
        `M${rcx - halfW},${rBotY} L${rcx - tipW},${rTopY + 2} Q${rcx},${rTopY} ${rcx + tipW},${rTopY + 2} L${rcx + halfW},${rBotY} Z`
      );
    } else {
      // root goes downward → taper toward bottom
      rootPaths.push(
        `M${rcx - halfW},${rTopY} L${rcx - tipW},${rBotY - 2} Q${rcx},${rBotY} ${rcx + tipW},${rBotY - 2} L${rcx + halfW},${rTopY} Z`
      );
    }
  });

  const isExtraction = cond === "extraction";
  const fillColor = isExtraction ? "#fef2f2" : "#f8fafc";
  const strokeColor = hasDot ? dot : "#cbd5e1";

  return (
    <div className="flex flex-col items-center gap-0.5" title={`${fdi} — ${CONDS[cond]!.label}`}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* roots */}
        {rootPaths.map((d, i) => (
          <path key={i} d={d} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={0.6} />
        ))}
        {/* crown */}
        <path d={crownPath} fill={fillColor} stroke={strokeColor} strokeWidth={hasDot ? 1 : 0.6} />
        {/* X for extraction */}
        {isExtraction && (
          <>
            <line x1={cx+1} y1={crownY+1} x2={cx+cw-1} y2={crownY+crownH-1} stroke="#ef4444" strokeWidth={0.8} />
            <line x1={cx+cw-1} y1={crownY+1} x2={cx+1} y2={crownY+crownH-1} stroke="#ef4444" strokeWidth={0.8} />
          </>
        )}
        {/* condition dot */}
        {hasDot && !isExtraction && (
          <circle
            cx={W / 2}
            cy={upper ? H - crownH / 2 : crownH / 2}
            r={2.2}
            fill={dot}
            opacity={0.85}
          />
        )}
      </svg>
      <span className="text-[7px] leading-none text-slate-400 font-medium">{fdi}</span>
    </div>
  );
}

// ── Stage pill ────────────────────────────────────────────────────────────────
function Stage({ n, title, items }: { n: number; title: string; items: string[] }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 h-full">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-black flex items-center justify-center shrink-0">{n}</div>
          <p className="text-[10px] font-bold text-orange-800 leading-tight uppercase">{title}</p>
        </div>
        <ul className="space-y-0.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-1 text-[9px] text-slate-600">
              <span className="text-orange-400 mt-0.5 shrink-0">•</span>{it}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 bg-orange-500 text-white px-3 py-2 rounded-t-xl">
      <span className="text-base">{icon}</span>
      <p className="text-xs font-bold uppercase tracking-wide">{title}</p>
    </div>
  );
}

function SectionBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-orange-200 border-t-0 rounded-b-xl bg-white px-3 py-3">
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function VariantA() {
  const [selectedFdi, setSelectedFdi] = useState<number | null>(44);

  return (
    <div className="min-h-screen bg-gray-50 font-sans" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* ── HEADER ── */}
      <div className="bg-white border-b border-orange-100 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">1Dent Clinic</p>
            <h1 className="text-lg font-black text-orange-600 leading-tight">ПЛАН ЛЕЧЕНИЯ</h1>
            <p className="text-[10px] text-slate-500 mt-0.5">Индивидуальный план для вашего здоровья</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] text-slate-500">📞 8771 800 00 65</p>
            <p className="text-[9px] text-slate-500 mt-0.5">📍 ул. Туркут Озала, 84</p>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {[
            ["Пациент", "Асель Нурланова"],
            ["Дата рождения", "12.03.1990"],
            ["Дата консультации", "12.05.2026"],
            ["Врач", "Диас Сейткали"],
          ].map(([l, v]) => (
            <div key={l}>
              <p className="text-[9px] text-slate-400 uppercase tracking-wide">{l}</p>
              <p className="text-xs font-semibold text-slate-800 mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 space-y-3">

        {/* ── DENTAL CHART ── */}
        <div>
          <SectionHeader icon="🦷" title="Схема зубов" />
          <SectionBody>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
              {Object.entries(CONDS).filter(([k]) => k !== "healthy").map(([k, v]) => (
                <div key={k} className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full border border-slate-200 shrink-0" style={{ background: v.dot }} />
                  <span className="text-[8px] text-slate-500">{v.label}</span>
                </div>
              ))}
            </div>

            {/* Upper jaw */}
            <p className="text-[8px] font-bold text-slate-400 text-center mb-1 uppercase tracking-widest">Верхняя челюсть</p>
            <div className="flex justify-center gap-0.5 mb-1">
              {UPPER.map((fdi, i) => (
                <button
                  key={fdi}
                  onClick={() => setSelectedFdi(selectedFdi === fdi ? null : fdi)}
                  className={`outline-none rounded ${selectedFdi === fdi ? "ring-2 ring-orange-400 ring-offset-1" : ""}`}
                >
                  <Tooth fdi={fdi} upper={true} />
                </button>
              ))}
            </div>
            {/* Numbers above = FDI already in Tooth component */}
            <div className="h-px bg-slate-200 my-2 mx-4" />
            <div className="flex justify-center gap-0.5 mt-1">
              {LOWER.map((fdi) => (
                <button
                  key={fdi}
                  onClick={() => setSelectedFdi(selectedFdi === fdi ? null : fdi)}
                  className={`outline-none rounded ${selectedFdi === fdi ? "ring-2 ring-orange-400 ring-offset-1" : ""}`}
                >
                  <Tooth fdi={fdi} upper={false} />
                </button>
              ))}
            </div>
            <p className="text-[8px] font-bold text-slate-400 text-center mt-1 uppercase tracking-widest">Нижняя челюсть</p>

            {/* Selected tooth info */}
            {selectedFdi && MOCK[selectedFdi] && (
              <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: CONDS[MOCK[selectedFdi]!]?.dot }} />
                <p className="text-xs font-semibold text-orange-800">
                  Зуб {selectedFdi} — {CONDS[MOCK[selectedFdi]!]?.label}
                </p>
              </div>
            )}
          </SectionBody>
        </div>

        {/* ── FINDINGS ── */}
        <div>
          <SectionHeader icon="🔍" title="Что мы обнаружили" />
          <SectionBody>
            <ul className="space-y-1.5">
              {[
                "Кариозное поражение зубов 44, 45, 46",
                "Отсутствие зубов 18, 48",
                "Разрушение зубов, требующих удаления (44)",
                "Риск потери зубов при отсутствии лечения",
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                  <span className="text-orange-500 font-bold shrink-0 mt-0.5">•</span>{t}
                </li>
              ))}
            </ul>
          </SectionBody>
        </div>

        {/* ── CONSEQUENCES ── */}
        <div>
          <SectionHeader icon="⚠️" title="Последствия отказа от лечения" />
          <SectionBody>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: "😣", label: "Усиление боли" },
                { icon: "🦷", label: "Потеря зуба" },
                { icon: "💀", label: "Атрофия кости" },
              ].map((c) => (
                <div key={c.label} className="text-center bg-red-50 rounded-lg p-2 border border-red-100">
                  <div className="text-2xl mb-1">{c.icon}</div>
                  <p className="text-[9px] font-semibold text-red-700 leading-tight">{c.label}</p>
                </div>
              ))}
            </div>
          </SectionBody>
        </div>

        {/* ── STAGES ── */}
        <div>
          <SectionHeader icon="📋" title="План лечения (Этапы)" />
          <SectionBody>
            <div className="space-y-2">
              {/* Stages row 1 */}
              <div className="flex gap-1.5">
                <Stage n={1} title="Диагностика" items={["Осмотр", "КТ, снимки", "Фотофиксация"]} />
                <div className="flex items-center text-orange-400 text-lg font-bold mt-3 shrink-0">›</div>
                <Stage n={2} title="Терапия" items={["Лечение кариеса", "Каналы", "Восстановление"]} />
              </div>
              <div className="flex gap-1.5">
                <Stage n={3} title="Хирургия" items={["Удаление зуба 44", "Лечение дёсен"]} />
                <div className="flex items-center text-orange-400 text-lg font-bold mt-3 shrink-0">›</div>
                <Stage n={4} title="Имплантация" items={["Установка имплантов", "Приживление"]} />
              </div>
              <Stage n={5} title="Ортопедия" items={["Коронки на 16, 26", "Мосты при необходимости"]} />
            </div>
          </SectionBody>
        </div>

        {/* ── COSTS ── */}
        <div>
          <SectionHeader icon="💰" title="Планируемая стоимость" />
          <SectionBody>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-1.5 text-[9px] text-slate-400 uppercase font-semibold">Этап</th>
                  <th className="text-left py-1.5 text-[9px] text-slate-400 uppercase font-semibold">Процедура</th>
                  <th className="text-right py-1.5 text-[9px] text-slate-400 uppercase font-semibold">Стоимость</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  ["1", "Диагностика", "Бесплатно"],
                  ["2", "Лечение кариеса ×2", "17 000 ₸"],
                  ["3", "Удаление зуба 44", "15 000 ₸"],
                  ["4", "Профессиональная чистка", "6 000 ₸"],
                  ["5", "Коронки металлокерамика ×2", "60 000 ₸"],
                ].map(([n, proc, cost]) => (
                  <tr key={n} className="hover:bg-orange-50 transition-colors">
                    <td className="py-2 text-slate-400 font-medium">{n}</td>
                    <td className="py-2 text-slate-700">{proc}</td>
                    <td className="py-2 text-right font-semibold text-slate-800">{cost}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-orange-200">
                  <td colSpan={2} className="pt-2.5 font-bold text-slate-700 text-sm">ИТОГО:</td>
                  <td className="pt-2.5 text-right font-black text-orange-600 text-sm">98 000 ₸</td>
                </tr>
              </tfoot>
            </table>

            <div className="mt-3 grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
              {[
                { icon: "💳", label: "Kaspi Red" },
                { icon: "📅", label: "Рассрочка до 12 мес." },
                { icon: "💵", label: "Наличные и безнал" },
              ].map((p) => (
                <div key={p.label} className="text-center bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <div className="text-lg mb-1">{p.icon}</div>
                  <p className="text-[8px] text-slate-600 font-medium leading-tight">{p.label}</p>
                </div>
              ))}
            </div>
          </SectionBody>
        </div>

        {/* ── RECOMMENDATIONS ── */}
        <div>
          <SectionHeader icon="💬" title="Рекомендации после консультации" />
          <SectionBody>
            <div className="space-y-2">
              {[
                "Не откладывайте лечение более чем на 3 месяца",
                "Пройдите профессиональную гигиену полости рта",
                "Выполните все рекомендованные обследования",
                "Соблюдайте домашнюю гигиену по рекомендации врача",
              ].map((t, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-green-100 text-green-600 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">✓</span>
                  <p className="text-xs text-slate-600 leading-relaxed">{t}</p>
                </div>
              ))}
            </div>
          </SectionBody>
        </div>

        {/* ── SIGNATURE ── */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-4">Подпись пациента</p>
              <div className="border-b border-slate-300 h-6" />
            </div>
            <div>
              <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-4">Подпись врача</p>
              <div className="border-b border-slate-300 h-6" />
            </div>
          </div>
          <p className="text-[9px] text-slate-400 text-center italic">
            Я ознакомлен(а) с планом лечения, стоимостью и согласен(а) с предложенным планом.
          </p>
        </div>

        {/* ── FOOTER ── */}
        <div className="text-center pb-4">
          <p className="text-sm font-bold text-orange-500" style={{ fontFamily: "Georgia, serif" }}>
            Спасибо, что доверяете нам свою улыбку! 🤍
          </p>
        </div>

      </div>
    </div>
  );
}

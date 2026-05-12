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

const CONDS: Record<string, { dot: string; label: string }> = {
  healthy:   { dot: "transparent", label: "Здоров" },
  treatment: { dot: "#3b82f6",     label: "Лечение" },
  extraction:{ dot: "#ef4444",     label: "Удаление" },
  implant:   { dot: "#22c55e",     label: "Имплантация" },
  crown:     { dot: "#eab308",     label: "Коронка/Протез" },
  problem:   { dot: "#f97316",     label: "Проблемная зона" },
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

// ── Tooth SVG (larger for tablet) ────────────────────────────────────────────
function Tooth({ fdi, upper, size = "md" }: { fdi: number; upper: boolean; size?: "sm" | "md" }) {
  const type = toothType(fdi);
  const cond = MOCK[fdi] ?? "healthy";
  const { dot } = CONDS[cond]!;
  const hasDot = dot !== "transparent";

  const W = size === "md" ? 18 : 14;
  const H = size === "md" ? 34 : 28;
  const crownH = type === "molar" ? (size === "md" ? 15 : 13) : (size === "md" ? 13 : 11);
  const rootH = H - crownH;

  const cw = type === "molar" ? W - 2 : type === "premolar" ? W - 4 : W - 6;
  const cx = (W - cw) / 2;
  const crownY = upper ? H - crownH : 0;
  const crownPath = `M${cx},${crownY} Q${cx-1},${crownY + crownH / 2} ${cx},${crownY + crownH} L${cx + cw},${crownY + crownH} Q${cx + cw + 1},${crownY + crownH / 2} ${cx + cw},${crownY} Z`;

  const numRoots = type === "molar" ? 3 : type === "premolar" ? 2 : 1;
  const rootW = numRoots === 1 ? 6 : numRoots === 2 ? 4.5 : 3.5;
  const spread = numRoots === 1 ? 0 : numRoots === 2 ? 4 : 5.5;
  const centers = numRoots === 1
    ? [W / 2]
    : numRoots === 2
    ? [W / 2 - spread / 2, W / 2 + spread / 2]
    : [W / 2 - spread, W / 2, W / 2 + spread];

  const rootPaths: string[] = [];
  centers.forEach((rcx) => {
    const rTopY = upper ? 0 : crownH;
    const rBotY = upper ? rootH : H;
    const hw = rootW / 2;
    const tw = hw * 0.3;
    if (upper) {
      rootPaths.push(`M${rcx-hw},${rBotY} L${rcx-tw},${rTopY+2} Q${rcx},${rTopY} ${rcx+tw},${rTopY+2} L${rcx+hw},${rBotY} Z`);
    } else {
      rootPaths.push(`M${rcx-hw},${rTopY} L${rcx-tw},${rBotY-2} Q${rcx},${rBotY} ${rcx+tw},${rBotY-2} L${rcx+hw},${rTopY} Z`);
    }
  });

  const isExtraction = cond === "extraction";
  const fillColor = isExtraction ? "#fef2f2" : "#f8fafc";
  const strokeColor = hasDot ? dot : "#cbd5e1";

  return (
    <div className="flex flex-col items-center gap-0.5 cursor-pointer" title={`${fdi} — ${CONDS[cond]!.label}`}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {rootPaths.map((d, i) => (
          <path key={i} d={d} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={0.7} />
        ))}
        <path d={crownPath} fill={fillColor} stroke={strokeColor} strokeWidth={hasDot ? 1.2 : 0.7} />
        {isExtraction && (
          <>
            <line x1={cx+1} y1={crownY+1} x2={cx+cw-1} y2={crownY+crownH-1} stroke="#ef4444" strokeWidth={1} />
            <line x1={cx+cw-1} y1={crownY+1} x2={cx+1} y2={crownY+crownH-1} stroke="#ef4444" strokeWidth={1} />
          </>
        )}
        {hasDot && !isExtraction && (
          <circle cx={W/2} cy={upper ? H - crownH/2 : crownH/2} r={2.8} fill={dot} opacity={0.85} />
        )}
      </svg>
      <span className="text-[8px] leading-none text-slate-400 font-medium">{fdi}</span>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2.5 bg-orange-500 text-white px-4 py-2.5 rounded-t-xl">
      <span className="text-lg">{icon}</span>
      <p className="text-sm font-bold uppercase tracking-wide">{title}</p>
    </div>
  );
}
function SectionBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-orange-200 border-t-0 rounded-b-xl bg-white px-4 py-4 ${className}`}>
      {children}
    </div>
  );
}

export function VariantB() {
  const [selectedFdi, setSelectedFdi] = useState<number | null>(44);

  return (
    <div className="min-h-screen bg-gray-50 font-sans" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>

      {/* ── HEADER ── */}
      <div className="bg-white border-b-2 border-orange-500">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-orange-50 border-2 border-orange-200 rounded-xl flex items-center justify-center text-2xl">🦷</div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">1Dent Clinic</p>
              <h1 className="text-2xl font-black text-orange-600 leading-none mt-0.5">ПЛАН ЛЕЧЕНИЯ</h1>
              <p className="text-xs text-slate-500 mt-1">Индивидуальный план для вашего здоровья</p>
            </div>
          </div>
          <div className="text-right space-y-1">
            <p className="text-xs text-slate-600">📞 8771 800 00 65</p>
            <p className="text-xs text-slate-600">✉️ info@muslimdent.kz</p>
            <p className="text-xs text-slate-600">📍 ул. Туркут Озала, 84</p>
          </div>
        </div>

        {/* Patient meta */}
        <div className="border-t border-slate-100 px-6 py-3 grid grid-cols-4 gap-4">
          {[
            ["Пациент (ФИО)", "Асель Нурланова"],
            ["Дата рождения", "12.03.1990"],
            ["Дата консультации", "12.05.2026"],
            ["Врач", "Диас Сейткали"],
          ].map(([l, v]) => (
            <div key={l}>
              <p className="text-[9px] text-slate-400 uppercase tracking-wide">{l}</p>
              <div className="border-b border-slate-300 mt-3 pb-0.5">
                <p className="text-sm font-semibold text-slate-800">{v}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4">

        {/* ── TWO-COLUMN: findings + dental chart ── */}
        <div className="grid grid-cols-5 gap-4">

          {/* Left: findings */}
          <div className="col-span-2 space-y-4">
            <div>
              <SectionHeader icon="🔍" title="Что мы обнаружили" />
              <SectionBody>
                <ul className="space-y-2">
                  {[
                    "Разрушение зубов и кариес",
                    "Воспалительные процессы",
                    "Отсутствие зубов 18, 48",
                    "Перегрузка жевательных зубов",
                    "Риск потери зубов при промедлении",
                  ].map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-orange-500 font-black shrink-0">•</span>{t}
                    </li>
                  ))}
                </ul>
              </SectionBody>
            </div>

            <div>
              <SectionHeader icon="⚠️" title="Последствия отказа" />
              <SectionBody>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: "😣", label: "Усиление боли" },
                    { icon: "🦷", label: "Потеря зуба" },
                    { icon: "⬅️", label: "Смещение зубов" },
                    { icon: "💀", label: "Атрофия кости" },
                  ].map((c) => (
                    <div key={c.label} className="text-center bg-red-50 rounded-lg p-2.5 border border-red-100">
                      <div className="text-2xl mb-1.5">{c.icon}</div>
                      <p className="text-[10px] font-semibold text-red-700">{c.label}</p>
                    </div>
                  ))}
                </div>
              </SectionBody>
            </div>
          </div>

          {/* Right: dental chart */}
          <div className="col-span-3">
            <SectionHeader icon="🦷" title="Схема зубов" />
            <SectionBody>
              {/* Legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
                {Object.entries(CONDS).filter(([k]) => k !== "healthy").map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full border border-slate-200 shrink-0" style={{ background: v.dot }} />
                    <span className="text-[10px] text-slate-600 font-medium">{v.label}</span>
                  </div>
                ))}
              </div>

              <p className="text-[9px] font-bold text-slate-400 text-center mb-1.5 uppercase tracking-widest">Верхняя челюсть</p>
              <div className="flex justify-center gap-0.5">
                {UPPER.map((fdi) => (
                  <button
                    key={fdi}
                    onClick={() => setSelectedFdi(selectedFdi === fdi ? null : fdi)}
                    className={`outline-none rounded transition-transform ${selectedFdi === fdi ? "ring-2 ring-orange-400 ring-offset-1 scale-110 z-10" : "hover:scale-105"}`}
                  >
                    <Tooth fdi={fdi} upper={true} size="md" />
                  </button>
                ))}
              </div>

              <div className="h-px bg-slate-200 my-2 mx-6" />

              <div className="flex justify-center gap-0.5">
                {LOWER.map((fdi) => (
                  <button
                    key={fdi}
                    onClick={() => setSelectedFdi(selectedFdi === fdi ? null : fdi)}
                    className={`outline-none rounded transition-transform ${selectedFdi === fdi ? "ring-2 ring-orange-400 ring-offset-1 scale-110 z-10" : "hover:scale-105"}`}
                  >
                    <Tooth fdi={fdi} upper={false} size="md" />
                  </button>
                ))}
              </div>
              <p className="text-[9px] font-bold text-slate-400 text-center mt-1.5 uppercase tracking-widest">Нижняя челюсть</p>

              {selectedFdi && MOCK[selectedFdi] && (
                <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: CONDS[MOCK[selectedFdi]!]?.dot }} />
                  <p className="text-sm font-semibold text-orange-800">
                    Зуб {selectedFdi} — {CONDS[MOCK[selectedFdi]!]?.label}
                  </p>
                </div>
              )}
            </SectionBody>
          </div>
        </div>

        {/* ── TREATMENT STAGES ── */}
        <div>
          <SectionHeader icon="📋" title="План лечения (Этапы)" />
          <SectionBody>
            <div className="flex gap-2 items-stretch">
              {[
                { n: 1, title: "Диагностика",      items: ["Осмотр", "КТ, снимки", "Фотофиксация", "Составление плана"] },
                { n: 2, title: "Терапевтическое лечение",  items: ["Лечение кариеса", "Лечение каналов", "Восстановление зубов"] },
                { n: 3, title: "Хирургическое лечение",    items: ["Удаление зуба 44", "Лечение дёсен", "Синус-лифтинг"] },
                { n: 4, title: "Имплантация",      items: ["Установка имплантов", "Формирователь десны", "Приживление"] },
                { n: 5, title: "Ортопедическое лечение",   items: ["Коронки", "Мосты", "Протезы"] },
              ].map((s, i, arr) => (
                <div key={s.n} className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="flex-1 bg-orange-50 border border-orange-200 rounded-xl p-3 h-full">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-orange-500 text-white text-xs font-black flex items-center justify-center shrink-0">{s.n}</div>
                      <p className="text-[10px] font-bold text-orange-800 uppercase leading-tight">{s.title}</p>
                    </div>
                    <ul className="space-y-1">
                      {s.items.map((it, ii) => (
                        <li key={ii} className="flex items-start gap-1 text-[10px] text-slate-600">
                          <span className="text-orange-400 shrink-0 mt-0.5">•</span>{it}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="text-orange-400 text-xl font-black shrink-0">›</div>
                  )}
                </div>
              ))}
            </div>
          </SectionBody>
        </div>

        {/* ── TWO-COLUMN: costs + variants ── */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <SectionHeader icon="💰" title="Стоимость лечения" />
            <SectionBody>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 text-[10px] text-slate-400 uppercase font-semibold">№</th>
                    <th className="text-left py-2 text-[10px] text-slate-400 uppercase font-semibold">Процедура</th>
                    <th className="text-right py-2 text-[10px] text-slate-400 uppercase font-semibold">Стоимость (₸)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {[
                    ["1", "Диагностика", "Бесплатно"],
                    ["2", "Лечение кариеса ×2", "17 000"],
                    ["3", "Удаление зуба 44", "15 000"],
                    ["4", "Проф. чистка", "6 000"],
                    ["5", "Коронки МК ×2", "60 000"],
                  ].map(([n, proc, cost]) => (
                    <tr key={n} className="hover:bg-orange-50">
                      <td className="py-2 text-slate-400 font-medium">{n}</td>
                      <td className="py-2 text-slate-700">{proc}</td>
                      <td className="py-2 text-right font-semibold text-slate-800">{cost}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-orange-300">
                    <td colSpan={2} className="pt-3 font-bold text-slate-700">ИТОГО:</td>
                    <td className="pt-3 text-right font-black text-orange-600 text-base">98 000 ₸</td>
                  </tr>
                </tfoot>
              </table>

              <div className="mt-4 pt-3 border-t border-slate-100">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Удобные способы оплаты</p>
                <div className="flex gap-2">
                  {[
                    { icon: "💳", label: "Kaspi Red" },
                    { icon: "📅", label: "Рассрочка 12 мес." },
                    { icon: "💵", label: "Безналичный расчёт" },
                  ].map((p) => (
                    <div key={p.label} className="flex-1 text-center bg-slate-50 rounded-lg py-2.5 border border-slate-100">
                      <div className="text-xl mb-1">{p.icon}</div>
                      <p className="text-[8px] text-slate-600 font-medium leading-tight">{p.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </SectionBody>
          </div>

          <div className="space-y-4">
            {/* Variant 1 & 2 */}
            <div>
              <SectionHeader icon="⭐" title="Варианты лечения" />
              <SectionBody>
                <div className="space-y-3">
                  <div className="border-2 border-orange-300 rounded-xl p-3 bg-orange-50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">💎</span>
                      <p className="text-xs font-bold text-orange-700 uppercase">Вариант 1 — Оптимальный</p>
                    </div>
                    <ul className="space-y-1 text-xs text-slate-600">
                      <li>• Полный план лечения (все этапы)</li>
                      <li>• Металлокерамические коронки</li>
                      <li>• Гарантия 2 года</li>
                    </ul>
                    <p className="text-sm font-black text-orange-600 mt-2">98 000 ₸</p>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">⭐</span>
                      <p className="text-xs font-bold text-slate-600 uppercase">Вариант 2 — Альтернативный</p>
                    </div>
                    <ul className="space-y-1 text-xs text-slate-600">
                      <li>• Только неотложное лечение</li>
                      <li>• Временные коронки</li>
                      <li>• Наблюдение 6 месяцев</li>
                    </ul>
                    <p className="text-sm font-black text-slate-700 mt-2">35 000 ₸</p>
                  </div>
                </div>
              </SectionBody>
            </div>

            <div>
              <SectionHeader icon="💬" title="Рекомендации" />
              <SectionBody>
                <div className="space-y-2">
                  {[
                    "Не откладывать более 3 месяцев",
                    "Пройти профессиональную гигиену",
                    "Выполнить рекомендованные обследования",
                    "Соблюдать домашнюю гигиену",
                  ].map((t, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-green-100 text-green-600 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">✓</span>
                      <p className="text-xs text-slate-600 leading-relaxed">{t}</p>
                    </div>
                  ))}
                </div>
              </SectionBody>
            </div>
          </div>
        </div>

        {/* ── BOTTOM ROW: doctor + trust + guarantees ── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: "👨‍⚕️", title: "Ваш врач", body: "Диас Сейткали — опытный специалист, который позаботится о вашем здоровье и комфорте." },
            { icon: "🏆", title: "Почему нам доверяют", body: "Современное оборудование · Опытные врачи · Индивидуальный подход · Безопасность и стерильность" },
            { icon: "🛡️", title: "Гарантии", body: "Мы предоставляем гарантию на все виды лечения согласно клиническим рекомендациям." },
            { icon: "💬", title: "Отзывы", body: "Сканируйте QR-код и читайте отзывы наших пациентов на сайте." },
          ].map((block) => (
            <div key={block.title} className="bg-white rounded-xl border border-slate-100 p-3">
              <div className="text-2xl mb-2">{block.icon}</div>
              <p className="text-[10px] font-bold text-slate-700 mb-1">{block.title}</p>
              <p className="text-[9px] text-slate-500 leading-relaxed">{block.body}</p>
            </div>
          ))}
        </div>

        {/* Signature line */}
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
          <p className="text-xs text-slate-500 italic text-center mb-4">
            Я ознакомлен(а) с планом лечения, стоимостью и согласен(а) с предложенным планом.
          </p>
          <div className="grid grid-cols-3 gap-6">
            {["Подпись пациента", "Дата", "Подпись врача"].map((l) => (
              <div key={l}>
                <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-3">{l}</p>
                <div className="border-b border-slate-300 h-6" />
              </div>
            ))}
          </div>
        </div>

        <div className="text-center py-2">
          <p className="text-base font-bold text-orange-500" style={{ fontFamily: "Georgia, serif" }}>
            Спасибо, что доверяете нам свою улыбку! 🤍
          </p>
        </div>

      </div>
    </div>
  );
}

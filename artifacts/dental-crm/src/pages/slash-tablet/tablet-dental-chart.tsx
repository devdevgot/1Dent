import { memo } from "react";
import { cn } from "@/lib/utils";
import { CONDITION_META, type ToothCondition } from "./mock-data";

const TOP_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const BOTTOM_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

// Pre-computed tooth silhouettes (root + crown) per FDI, matching the system chart shape.
const TOOTH_PATHS: Record<number, { root: string; crown: string }> = {};
function computeToothPaths(id: number): { root: string; crown: string } {
  const pos = id % 10;
  const isTop = Math.floor(id / 10) === 1 || Math.floor(id / 10) === 2;
  let root = "";
  let crown = "";
  if (isTop) {
    if (pos <= 3) {
      root = "M 14 50 C 14 20, 18 5, 20 5 C 22 5, 26 20, 26 50 Z";
      crown = "M 14 50 C 10 60, 12 85, 14 90 L 26 90 C 28 85, 30 60, 26 50 Z";
    } else if (pos === 4 || pos === 5) {
      root = "M 12 50 C 12 20, 14 5, 16 5 C 18 5, 18 20, 19 50 Z M 21 50 C 22 20, 22 5, 24 5 C 26 5, 28 20, 28 50 Z";
      crown = "M 12 50 C 8 60, 10 85, 14 90 C 16 92, 24 92, 26 90 C 30 85, 32 60, 28 50 Z";
    } else {
      root = "M 8 50 C 8 20, 10 5, 12 5 C 14 5, 14 20, 15 50 Z M 16 50 C 18 25, 18 10, 20 10 C 22 10, 22 25, 24 50 Z M 25 50 C 26 20, 26 5, 28 5 C 30 5, 32 20, 32 50 Z";
      crown = "M 8 50 C 4 60, 6 85, 10 90 C 15 93, 25 93, 30 90 C 34 85, 36 60, 32 50 Z";
    }
  } else {
    if (pos <= 3) {
      root = "M 14 50 C 14 80, 18 95, 20 95 C 22 95, 26 80, 26 50 Z";
      crown = "M 14 50 C 10 40, 12 15, 14 10 L 26 10 C 28 15, 30 40, 26 50 Z";
    } else if (pos === 4 || pos === 5) {
      root = "M 12 50 C 12 80, 18 95, 20 95 C 22 95, 28 80, 28 50 Z";
      crown = "M 12 50 C 8 40, 10 15, 14 10 C 16 8, 24 8, 26 10 C 30 15, 32 40, 28 50 Z";
    } else {
      root = "M 8 50 C 8 80, 12 95, 15 95 C 18 95, 18 80, 19 50 Z M 21 50 C 22 80, 22 95, 25 95 C 28 95, 32 80, 32 50 Z";
      crown = "M 8 50 C 4 40, 6 15, 10 10 C 15 7, 25 7, 30 10 C 34 15, 36 40, 32 50 Z";
    }
  }
  return { root, crown };
}
for (const id of [...TOP_TEETH, ...BOTTOM_TEETH]) TOOTH_PATHS[id] = computeToothPaths(id);

const Tooth = memo(function Tooth({
  id, condition, selected, inPlan, big, onClick,
}: {
  id: number;
  condition: ToothCondition;
  selected: boolean;
  inPlan: boolean;
  big?: boolean;
  onClick?: (fdi: number) => void;
}) {
  const isTop = Math.floor(id / 10) === 1 || Math.floor(id / 10) === 2;
  const { root, crown } = TOOTH_PATHS[id]!;
  const meta = CONDITION_META[condition];
  const isMissing = condition === "missing";

  const crownFill = isMissing ? "transparent" : condition === "healthy" ? "#ffffff" : meta.color;
  const rootFill = condition === "extraction_needed" ? "#ffe4e6" : isMissing ? "transparent" : "#ffffff";
  const stroke = meta.color;

  const num = (
    <span
      className={cn(
        "font-semibold transition-colors leading-none",
        big ? "text-[13px]" : "text-[11px]",
        selected ? "text-[#1f75fe]" : "text-[#94a3b8]",
      )}
    >
      {id}
    </span>
  );

  return (
    <button
      type="button"
      onClick={() => onClick?.(id)}
      title={`Зуб ${id} — ${meta.label}`}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl p-1 transition-all outline-none",
        onClick && "cursor-pointer active:scale-95 hover:bg-[#faf8f4]",
        selected && "bg-[#1f75fe]/8 ring-2 ring-[#1f75fe] ring-offset-1",
      )}
    >
      {isTop && num}
      <div className="relative">
        <svg
          viewBox="0 0 40 100"
          className={cn("h-auto", big ? "w-[34px]" : "w-[26px]")}
        >
          <path d={root} fill={rootFill} stroke={stroke} strokeWidth={1.2}
            strokeDasharray={isMissing ? "3 3" : "none"} />
          {condition === "implant" && (
            <g fill="none" stroke={meta.color} strokeWidth="2.5" strokeLinecap="round">
              {isTop ? (
                <><line x1="20" y1="50" x2="20" y2="18" /><line x1="16" y1="24" x2="24" y2="24" /><line x1="16" y1="30" x2="24" y2="30" /><line x1="16" y1="36" x2="24" y2="36" /><line x1="16" y1="42" x2="24" y2="42" /></>
              ) : (
                <><line x1="20" y1="50" x2="20" y2="82" /><line x1="16" y1="58" x2="24" y2="58" /><line x1="16" y1="64" x2="24" y2="64" /><line x1="16" y1="70" x2="24" y2="70" /><line x1="16" y1="76" x2="24" y2="76" /></>
              )}
            </g>
          )}
          <path d={crown} fill={crownFill} stroke={stroke} strokeWidth={1.4}
            strokeDasharray={isMissing ? "3 3" : "none"} />
          {isMissing && (
            <g opacity={0.6}>
              <line x1="12" y1="62" x2="28" y2="78" stroke="#9ca3af" strokeWidth={2.2} strokeLinecap="round" />
              <line x1="28" y1="62" x2="12" y2="78" stroke="#9ca3af" strokeWidth={2.2} strokeLinecap="round" />
            </g>
          )}
        </svg>
        {inPlan && !isMissing && (
          <span className="absolute -right-0.5 -top-0.5 w-2.5 h-2.5 rounded-full bg-lime-500 ring-2 ring-white" />
        )}
      </div>
      {!isTop && num}
    </button>
  );
});

export function TabletDentalChart({
  teeth,
  selectedFdi,
  planFdis,
  onSelect,
  big,
  presentation,
}: {
  teeth: Record<number, ToothCondition>;
  selectedFdi: number | null;
  planFdis: Set<number>;
  onSelect?: (fdi: number) => void;
  big?: boolean;
  presentation?: boolean;
}) {
  const cond = (id: number): ToothCondition => teeth[id] ?? "healthy";

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-[#e8e3d9] bg-white p-4 md:p-6">
        {/* Upper jaw */}
        <div className="grid items-end" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
          {TOP_TEETH.map((id) => (
            <Tooth key={id} id={id} condition={cond(id)} selected={selectedFdi === id}
              inPlan={planFdis.has(id)} big={big} onClick={onSelect} />
          ))}
        </div>
        {/* Midline */}
        <div className="my-3 flex items-center gap-3 px-1">
          <div className="h-px flex-1 bg-[#e8e3d9]" />
          <span className="text-[10px] font-semibold text-[#cbd5e1]">R · L</span>
          <div className="h-px flex-1 bg-[#e8e3d9]" />
        </div>
        {/* Lower jaw */}
        <div className="grid items-start" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
          {BOTTOM_TEETH.map((id) => (
            <Tooth key={id} id={id} condition={cond(id)} selected={selectedFdi === id}
              inPlan={planFdis.has(id)} big={big} onClick={onSelect} />
          ))}
        </div>
      </div>

      {/* Legend */}
      {!presentation && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 px-1">
          {(Object.entries(CONDITION_META) as [ToothCondition, (typeof CONDITION_META)[ToothCondition]][])
            .filter(([k]) => k !== "healthy")
            .map(([key, m]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-full border" style={{ background: m.bg, borderColor: m.color }} />
                <span className="text-[11px] font-medium text-[#64748b]">{m.label}</span>
              </div>
            ))}
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-lime-500" />
            <span className="text-[11px] font-medium text-[#64748b]">В плане</span>
          </div>
        </div>
      )}
    </div>
  );
}

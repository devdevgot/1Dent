import type { ToothCondition, ToothRecord } from "@workspace/api-client-react";
import { CONDITION_CONFIG } from "./fdi-chart";
import { cn } from "@/lib/utils";

const UPPER_LEFT  = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_RIGHT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT  = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_RIGHT = [31, 32, 33, 34, 35, 36, 37, 38];

const UPPER_ROW = [...UPPER_LEFT, ...UPPER_RIGHT];
const LOWER_ROW = [...LOWER_LEFT, ...LOWER_RIGHT];

interface ToothMiniGridProps {
  teeth: ToothRecord[];
  selectedFdis: number[];
  onToggle: (fdi: number) => void;
}

function ToothButton({
  fdi,
  record,
  selected,
  onToggle,
}: {
  fdi: number;
  record: ToothRecord | undefined;
  selected: boolean;
  onToggle: (fdi: number) => void;
}) {
  const condition: ToothCondition = record?.condition ?? "healthy";
  const cfg = CONDITION_CONFIG[condition];
  const isMidline = fdi === 11 || fdi === 21 || fdi === 31 || fdi === 41;

  return (
    <button
      type="button"
      title={`${fdi} — ${cfg.label}`}
      onClick={() => onToggle(fdi)}
      className={cn(
        "relative flex items-center justify-center rounded text-[9px] font-bold transition-all select-none",
        "flex-1 aspect-square max-w-[26px] min-w-0 border-2",
        selected
          ? "border-primary ring-2 ring-primary/40 scale-110 z-10"
          : "border-transparent hover:border-[#d4cfc6]",
        isMidline && "ml-0.5",
      )}
      style={{
        backgroundColor: cfg.crownFill,
        color: cfg.textColor,
        borderColor: selected ? undefined : cfg.stroke,
      }}
    >
      {fdi % 10}
      {selected && (
        <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-primary rounded-full border-2 border-white" />
      )}
    </button>
  );
}

export function ToothMiniGrid({ teeth, selectedFdis, onToggle }: ToothMiniGridProps) {
  const toothMap = new Map(teeth.map((t) => [t.toothFdi, t]));

  return (
    <div className="select-none w-full">
      <div className="flex items-center gap-1 mb-1 w-full justify-between">
        <span className="text-[9px] font-semibold text-[var(--text-secondary)] w-6 text-right shrink-0">Q1</span>
        <div className="flex flex-1 min-w-0 gap-0.5 justify-end">
          {UPPER_LEFT.map((fdi) => (
            <ToothButton
              key={fdi}
              fdi={fdi}
              record={toothMap.get(fdi)}
              selected={selectedFdis.includes(fdi)}
              onToggle={onToggle}
            />
          ))}
        </div>
        <div className="w-px h-5 bg-[#e8e3d9] shrink-0 mx-0.5" />
        <div className="flex flex-1 min-w-0 gap-0.5 justify-start">
          {UPPER_RIGHT.map((fdi) => (
            <ToothButton
              key={fdi}
              fdi={fdi}
              record={toothMap.get(fdi)}
              selected={selectedFdis.includes(fdi)}
              onToggle={onToggle}
            />
          ))}
        </div>
        <span className="text-[9px] font-semibold text-[var(--text-secondary)] w-6 shrink-0">Q2</span>
      </div>

      <div className="flex items-center gap-1 w-full justify-between">
        <span className="text-[9px] font-semibold text-[var(--text-secondary)] w-6 text-right shrink-0">Q4</span>
        <div className="flex flex-1 min-w-0 gap-0.5 justify-end">
          {LOWER_LEFT.map((fdi) => (
            <ToothButton
              key={fdi}
              fdi={fdi}
              record={toothMap.get(fdi)}
              selected={selectedFdis.includes(fdi)}
              onToggle={onToggle}
            />
          ))}
        </div>
        <div className="w-px h-5 bg-[#e8e3d9] shrink-0 mx-0.5" />
        <div className="flex flex-1 min-w-0 gap-0.5 justify-start">
          {LOWER_ROW.slice(8).map((fdi) => (
            <ToothButton
              key={fdi}
              fdi={fdi}
              record={toothMap.get(fdi)}
              selected={selectedFdis.includes(fdi)}
              onToggle={onToggle}
            />
          ))}
        </div>
        <span className="text-[9px] font-semibold text-[var(--text-secondary)] w-6 shrink-0">Q3</span>
      </div>

      <div className="flex mt-1 flex-wrap gap-1">
        {Object.entries(CONDITION_CONFIG).slice(0, 4).map(([cond, cfg]) => (
          <span key={cond} className="flex items-center gap-1 text-[9px] text-[var(--text-secondary)]">
            <span className="inline-block w-2.5 h-2.5 rounded-sm border" style={{ backgroundColor: cfg.crownFill, borderColor: cfg.stroke }} />
            {cfg.label}
          </span>
        ))}
        {Object.entries(CONDITION_CONFIG).slice(4).map(([cond, cfg]) => (
          <span key={cond} className="flex items-center gap-1 text-[9px] text-[var(--text-secondary)]">
            <span className="inline-block w-2.5 h-2.5 rounded-sm border" style={{ backgroundColor: cfg.crownFill, borderColor: cfg.stroke }} />
            {cfg.label}
          </span>
        ))}
      </div>
    </div>
  );
}

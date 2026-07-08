import { memo, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { ToothCondition, ToothRecord } from "@workspace/api-client-react";

export type { ToothCondition };

/** Returns the number of root canals for a given FDI tooth number */
export function getCanalCount(fdi: number): number {
  const n = fdi % 10;          // position within quadrant (1–8)
  const q = Math.floor(fdi / 10); // quadrant (1–4)
  const isUpper = q === 1 || q === 2;
  if (n === 1 || n === 2) return 1; // central & lateral incisors
  if (n === 3)            return 1; // canines
  if (n === 4)            return isUpper ? 2 : 1; // 1st premolar: upper=2, lower=1
  if (n === 5)            return 1; // 2nd premolars mostly 1
  if (n === 6 || n === 7) return 3; // 1st & 2nd molars
  if (n === 8)            return 3; // wisdom teeth (simplified to 3)
  return 1;
}

export const COLORS = {
  caries: '#F5A623',
  pulpitis: '#D0021B',
  periodontitis: '#9013FE',
  extraction: '#8B0000',
  missing: '#B0B5C1',
  implant: '#2F9E99',
  crown: '#F8E71C',
  filling: '#4A90E2',
  healthy: '#B0B5C1',
  defaultStroke: '#B0B5C1',
};

export const CONDITION_CONFIG: Record<
  ToothCondition,
  { label: string; crownFill: string; stroke: string; rootFill?: string; textColor: string }
> = {
  healthy:           { label: "Здоров",      crownFill: "#ffffff",  stroke: "#B0B5C1",  textColor: "#166534" },
  cavity:            { label: "Кариес",      crownFill: "#F5A623",  stroke: "#F5A623",  textColor: "#92400e" },
  treated:           { label: "Пролечен",    crownFill: "#4A90E2",  stroke: "#4A90E2",  textColor: "#1e40af" },
  crown:             { label: "Коронка",     crownFill: "#F8E71C",  stroke: "#E5C100",  textColor: "#78350f" },
  root_canal:        { label: "Канал",       crownFill: "#D0021B",  stroke: "#D0021B",  textColor: "#7c2d12" },
  implant:           { label: "Имплант",     crownFill: "#2F9E99",  stroke: "#2F9E99",  textColor: "#064e3b" },
  missing:           { label: "Отсутствует", crownFill: "transparent",  stroke: "#B0B5C1",  textColor: "#6b7280" },
  extraction_needed: { label: "Удаление",    crownFill: "#8B0000",  stroke: "#8B0000",  textColor: "#991b1b" },
};

export type ToothMap = Map<number, ToothRecord>;

const TOP_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const BOTTOM_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

// Pre-compute SVG paths for all 32 teeth at module load (pure function of FDI number)
const TOOTH_PATHS_CACHE: Record<number, { root: string; crown: string }> = {};

function computeToothPaths(id: number): { root: string; crown: string } {
  const pos = id % 10;
  const isTop = Math.floor(id / 10) === 1 || Math.floor(id / 10) === 2;

  let root = '';
  let crown = '';

  if (isTop) {
    if (pos <= 3) {
      root = 'M 14 50 C 14 20, 18 5, 20 5 C 22 5, 26 20, 26 50 Z';
      crown = 'M 14 50 C 10 60, 12 85, 14 90 L 26 90 C 28 85, 30 60, 26 50 Z';
    } else if (pos === 4 || pos === 5) {
      root = 'M 12 50 C 12 20, 14 5, 16 5 C 18 5, 18 20, 19 50 Z M 21 50 C 22 20, 22 5, 24 5 C 26 5, 28 20, 28 50 Z';
      crown = 'M 12 50 C 8 60, 10 85, 14 90 C 16 92, 24 92, 26 90 C 30 85, 32 60, 28 50 Z';
    } else {
      root = 'M 8 50 C 8 20, 10 5, 12 5 C 14 5, 14 20, 15 50 Z M 16 50 C 18 25, 18 10, 20 10 C 22 10, 22 25, 24 50 Z M 25 50 C 26 20, 26 5, 28 5 C 30 5, 32 20, 32 50 Z';
      crown = 'M 8 50 C 4 60, 6 85, 10 90 C 15 93, 25 93, 30 90 C 34 85, 36 60, 32 50 Z';
    }
  } else {
    if (pos <= 3) {
      root = 'M 14 50 C 14 80, 18 95, 20 95 C 22 95, 26 80, 26 50 Z';
      crown = 'M 14 50 C 10 40, 12 15, 14 10 L 26 10 C 28 15, 30 40, 26 50 Z';
    } else if (pos === 4 || pos === 5) {
      root = 'M 12 50 C 12 80, 18 95, 20 95 C 22 95, 28 80, 28 50 Z';
      crown = 'M 12 50 C 8 40, 10 15, 14 10 C 16 8, 24 8, 26 10 C 30 15, 32 40, 28 50 Z';
    } else {
      root = 'M 8 50 C 8 80, 12 95, 15 95 C 18 95, 18 80, 19 50 Z M 21 50 C 22 80, 22 95, 25 95 C 28 95, 32 80, 32 50 Z';
      crown = 'M 8 50 C 4 40, 6 15, 10 10 C 15 7, 25 7, 30 10 C 34 15, 36 40, 32 50 Z';
    }
  }

  return { root, crown };
}

for (const id of [...TOP_TEETH, ...BOTTOM_TEETH]) {
  TOOTH_PATHS_CACHE[id] = computeToothPaths(id);
}

// Legend is static — render once
const Legend = memo(function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 mt-6 pt-4 border-t border-[#e8e3d9] justify-start">
      {(Object.entries(CONDITION_CONFIG) as [ToothCondition, (typeof CONDITION_CONFIG)[ToothCondition]][]).map(
        ([cond, cfg]) => (
          <div key={cond} className="flex items-center gap-2">
            <span
              className="w-3.5 h-3.5 rounded-full border shrink-0"
              style={{
                background: cond === 'missing' ? 'transparent' : cfg.crownFill,
                borderColor: cfg.stroke,
                borderStyle: cond === 'missing' ? 'dashed' : 'solid'
              }}
            />
            <span className="text-[11px] font-medium text-[#64748b]">{cfg.label}</span>
          </div>
        )
      )}
    </div>
  );
});

interface ToothProps {
  id: number;
  condition: ToothCondition;
  isSelected: boolean;
  isInProgress: boolean;
  isDisabled: boolean;
  onClick?: (fdi: number) => void;
}

const Tooth = memo(function Tooth({ id, condition, isSelected, isInProgress, isDisabled, onClick }: ToothProps) {
  const isTop = Math.floor(id / 10) === 1 || Math.floor(id / 10) === 2;
  const { root, crown } = TOOTH_PATHS_CACHE[id]!;

  let rootFill = '#FFFFFF';
  let crownFill = '#FFFFFF';
  let stroke = COLORS.defaultStroke;
  let strokeDasharray = 'none';
  const crownStrokeWidth = 1;

  if (condition === 'missing') {
    strokeDasharray = '3 3';
    rootFill = 'transparent';
    crownFill = 'transparent';
  } else if (condition === 'cavity') {
    crownFill = COLORS.caries;
    stroke = COLORS.caries;
  } else if (condition === 'root_canal') {
    crownFill = COLORS.pulpitis;
    stroke = COLORS.pulpitis;
  } else if (condition === 'extraction_needed') {
    crownFill = COLORS.extraction;
    rootFill = '#FFCCCC';
    stroke = COLORS.extraction;
  } else if (condition === 'crown') {
    crownFill = COLORS.crown;
    stroke = '#E5C100';
  } else if (condition === 'treated') {
    crownFill = COLORS.filling;
    stroke = COLORS.filling;
  } else if (condition === 'implant') {
    crownFill = COLORS.implant;
    stroke = COLORS.implant;
  }

  const handleClick = useCallback(() => {
    if (!isDisabled && onClick) onClick(id);
  }, [isDisabled, onClick, id]);

  return (
    <div
      onClick={handleClick}
      className={cn(
        "flex flex-col items-center gap-0.5 sm:gap-1 md:gap-2 cursor-pointer group p-0.5 sm:p-1 rounded-lg sm:rounded-xl",
        isSelected && "ring-2 ring-blue-500 ring-offset-1 sm:ring-offset-2 bg-blue-50/40 scale-105 shadow-sm",
        isInProgress && "ring-2 ring-emerald-500 ring-offset-1 sm:ring-offset-2 bg-emerald-50/40 animate-pulse scale-105",
        isDisabled ? "opacity-35 cursor-not-allowed pointer-events-none" : "hover:scale-105 hover:bg-[#faf8f4]/50",
      )}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-label={`Зуб ${id}`}
    >
      {isTop && <span className="text-[10px] md:text-xs font-semibold text-[#94a3b8] group-hover:text-blue-500 transition-colors">{id}</span>}

      <svg viewBox="0 0 40 100" className="w-full h-auto max-w-[28px] sm:max-w-[32px] md:max-w-[40px] aspect-[4/10]">
        {condition !== 'implant' && (
          <path d={root} fill={rootFill} stroke={stroke} strokeWidth={1} strokeDasharray={strokeDasharray} />
        )}

        {condition === 'implant' && (
          <g fill="none" stroke={COLORS.implant} strokeWidth="2.5" strokeLinecap="round">
            {isTop ? (
              <>
                <line x1="20" y1="50" x2="20" y2="15" />
                <line x1="15" y1="45" x2="25" y2="45" />
                <line x1="16" y1="40" x2="24" y2="40" />
                <line x1="16" y1="35" x2="24" y2="35" />
                <line x1="16" y1="30" x2="24" y2="30" />
                <line x1="16" y1="25" x2="24" y2="25" />
                <line x1="16" y1="20" x2="24" y2="20" />
              </>
            ) : (
              <>
                <line x1="20" y1="50" x2="20" y2="85" />
                <line x1="15" y1="55" x2="25" y2="55" />
                <line x1="16" y1="60" x2="24" y2="60" />
                <line x1="16" y1="65" x2="24" y2="65" />
                <line x1="16" y1="70" x2="24" y2="70" />
                <line x1="16" y1="75" x2="24" y2="75" />
                <line x1="16" y1="80" x2="24" y2="80" />
              </>
            )}
          </g>
        )}

        <path d={crown} fill={crownFill} stroke={stroke} strokeWidth={crownStrokeWidth} strokeDasharray={strokeDasharray} />

        {condition === 'missing' && (
          <g opacity={0.65}>
            <line x1="12" y1="62" x2="28" y2="78" stroke="#9ca3af" strokeWidth={2} strokeLinecap="round" />
            <line x1="28" y1="62" x2="12" y2="78" stroke="#9ca3af" strokeWidth={2} strokeLinecap="round" />
          </g>
        )}
      </svg>

      {!isTop && <span className="text-[10px] md:text-xs font-semibold text-[#94a3b8] group-hover:text-blue-500 transition-colors">{id}</span>}
    </div>
  );
});

interface FdiChartProps {
  teethData: ToothMap;
  selectedFdi: number | null;
  onToothClick?: (fdi: number) => void;
  inProgressFdi?: number | null;
  disabledFdis?: Set<number>;
  className?: string;
}

export const FdiChart = memo(function FdiChart({ teethData, selectedFdi, onToothClick, inProgressFdi, disabledFdis, className }: FdiChartProps) {
  return (
    <div className={cn("w-full bg-white rounded-2xl border border-[#e8e3d9]/80 p-4 sm:p-5", className)}>
      <div className="w-full pb-2">
        <div className="w-full px-1 py-2 space-y-6 sm:space-y-8 relative">

          {/* Upper jaw */}
          <div className="grid items-end pb-8 border-b border-[#e8e3d9] relative" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
            <div className="absolute left-1/2 top-2 bottom-6 w-px bg-[#e8e3d9]/60 transform -translate-x-1/2" />
            {TOP_TEETH.map((id) => (
              <Tooth
                key={id}
                id={id}
                condition={teethData.get(id)?.condition ?? "healthy"}
                isSelected={selectedFdi === id}
                isInProgress={inProgressFdi === id}
                isDisabled={disabledFdis?.has(id) ?? false}
                onClick={onToothClick}
              />
            ))}
          </div>

          {/* Lower jaw */}
          <div className="grid items-start pt-2 relative" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
            <div className="absolute left-1/2 top-4 bottom-2 w-px bg-[#e8e3d9]/60 transform -translate-x-1/2" />
            {BOTTOM_TEETH.map((id) => (
              <Tooth
                key={id}
                id={id}
                condition={teethData.get(id)?.condition ?? "healthy"}
                isSelected={selectedFdi === id}
                isInProgress={inProgressFdi === id}
                isDisabled={disabledFdis?.has(id) ?? false}
                onClick={onToothClick}
              />
            ))}
          </div>

        </div>
      </div>

      <Legend />
    </div>
  );
});

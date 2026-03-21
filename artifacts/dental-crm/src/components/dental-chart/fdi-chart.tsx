import { cn } from "@/lib/utils";
import type { ToothCondition, ToothRecord } from "@workspace/api-client-react";

export type { ToothCondition };

export const CONDITION_CONFIG: Record<
  ToothCondition,
  { label: string; fill: string; stroke: string; textColor: string }
> = {
  healthy:            { label: "Здоров",              fill: "#ffffff", stroke: "#d1d5db", textColor: "#374151" },
  cavity:             { label: "Кариес",              fill: "#fde68a", stroke: "#f59e0b", textColor: "#92400e" },
  treated:            { label: "Пролечен",            fill: "#bfdbfe", stroke: "#3b82f6", textColor: "#1e40af" },
  crown:              { label: "Коронка",             fill: "#fef3c7", stroke: "#d97706", textColor: "#92400e" },
  root_canal:         { label: "Канал",               fill: "#fed7aa", stroke: "#ea580c", textColor: "#7c2d12" },
  implant:            { label: "Имплант",             fill: "#a7f3d0", stroke: "#10b981", textColor: "#064e3b" },
  missing:            { label: "Отсутствует",         fill: "#f9fafb", stroke: "#9ca3af", textColor: "#6b7280" },
  extraction_needed:  { label: "Удаление",            fill: "#fee2e2", stroke: "#ef4444", textColor: "#991b1b" },
};

export type ToothMap = Map<number, ToothRecord>;

interface FdiChartProps {
  teethData: ToothMap;
  selectedFdi: number | null;
  onToothClick: (fdi: number) => void;
  className?: string;
}

const UPPER_LEFT  = [18, 17, 16, 15, 14, 13, 12, 11]; // Q1 — patient right → viewer left
const UPPER_RIGHT = [21, 22, 23, 24, 25, 26, 27, 28]; // Q2 — patient left  → viewer right
const LOWER_LEFT  = [48, 47, 46, 45, 44, 43, 42, 41]; // Q4 — patient right → viewer left
const LOWER_RIGHT = [31, 32, 33, 34, 35, 36, 37, 38]; // Q3 — patient left  → viewer right

const UPPER_ROW = [...UPPER_LEFT, ...UPPER_RIGHT];
const LOWER_ROW = [...LOWER_LEFT, ...LOWER_RIGHT];

function toothWidth(fdi: number): number {
  const n = fdi % 10;
  if (n >= 6) return 22; // molars
  if (n === 5 || n === 4) return 18; // premolars
  if (n === 3) return 16; // canine
  return 14; // incisors 1, 2
}

function ToothShape({
  fdi,
  record,
  isSelected,
  isUpper,
  onClick,
}: {
  fdi: number;
  record: ToothRecord | undefined;
  isSelected: boolean;
  isUpper: boolean;
  onClick: () => void;
}) {
  const condition: ToothCondition = record?.condition ?? "healthy";
  const config = CONDITION_CONFIG[condition];
  const w = toothWidth(fdi);
  const h = 32;
  const rx = condition === "missing" ? 2 : 5;

  const strokeDasharray = condition === "missing" ? "4 3" : undefined;
  const selectedRing = isSelected ? "#6366f1" : undefined;

  return (
    <g
      className="cursor-pointer"
      onClick={onClick}
      role="button"
      aria-label={`Зуб ${fdi}: ${config.label}`}
    >
      {isSelected && (
        <rect
          x={-3}
          y={isUpper ? -3 : -3}
          width={w + 6}
          height={h + 6}
          rx={rx + 2}
          fill="none"
          stroke={selectedRing}
          strokeWidth={2}
          opacity={0.8}
        />
      )}
      <rect
        x={0}
        y={0}
        width={w}
        height={h}
        rx={rx}
        fill={config.fill}
        stroke={config.stroke}
        strokeWidth={1.5}
        strokeDasharray={strokeDasharray}
      />
      {/* Cusp lines for molars */}
      {w >= 22 && condition !== "missing" && (
        <>
          <line x1={w / 3} y1={4} x2={w / 3} y2={h - 4} stroke={config.stroke} strokeWidth={0.5} opacity={0.4} />
          <line x1={(w * 2) / 3} y1={4} x2={(w * 2) / 3} y2={h - 4} stroke={config.stroke} strokeWidth={0.5} opacity={0.4} />
        </>
      )}
      {/* FDI number label */}
      <text
        x={w / 2}
        y={isUpper ? h + 12 : -4}
        textAnchor="middle"
        fontSize={9}
        fill="#6b7280"
        fontFamily="system-ui"
      >
        {fdi}
      </text>
    </g>
  );
}

const GAP = 3; // gap between teeth
const CENTER_GAP = 6; // midline gap

function buildRowPositions(row: number[]): { fdi: number; x: number }[] {
  const positions: { fdi: number; x: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < row.length; i++) {
    const fdi = row[i]!;
    if (i === 8) cursor += CENTER_GAP; // midline
    positions.push({ fdi, x: cursor });
    cursor += toothWidth(fdi) + GAP;
  }
  return positions;
}

export function FdiChart({ teethData, selectedFdi, onToothClick, className }: FdiChartProps) {
  const upperPositions = buildRowPositions(UPPER_ROW);
  const lowerPositions = buildRowPositions(LOWER_ROW);

  const totalWidth = upperPositions[upperPositions.length - 1]!.x + toothWidth(UPPER_ROW[UPPER_ROW.length - 1]!);
  const toothH = 32;
  const midGap = 18;
  const labelPad = 14;
  const svgH = toothH * 2 + midGap + labelPad * 2 + 8;
  const upperY = labelPad;
  const lowerY = upperY + toothH + midGap;

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <svg
        viewBox={`-4 0 ${totalWidth + 8} ${svgH}`}
        className="w-full max-w-[640px] mx-auto select-none"
        aria-label="FDI Dental Chart"
      >
        {/* Upper row */}
        {upperPositions.map(({ fdi, x }) => (
          <g key={fdi} transform={`translate(${x}, ${upperY})`}>
            <ToothShape
              fdi={fdi}
              record={teethData.get(fdi)}
              isSelected={selectedFdi === fdi}
              isUpper={true}
              onClick={() => onToothClick(fdi)}
            />
          </g>
        ))}

        {/* Midline */}
        <line
          x1={0}
          y1={upperY + toothH + midGap / 2}
          x2={totalWidth}
          y2={upperY + toothH + midGap / 2}
          stroke="#e5e7eb"
          strokeWidth={1}
          strokeDasharray="6 4"
        />

        {/* Lower row */}
        {lowerPositions.map(({ fdi, x }) => (
          <g key={fdi} transform={`translate(${x}, ${lowerY})`}>
            <ToothShape
              fdi={fdi}
              record={teethData.get(fdi)}
              isSelected={selectedFdi === fdi}
              isUpper={false}
              onClick={() => onToothClick(fdi)}
            />
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 px-1">
        {(Object.entries(CONDITION_CONFIG) as [ToothCondition, typeof CONDITION_CONFIG[ToothCondition]][]).map(([cond, cfg]) => (
          <div key={cond} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm border shrink-0"
              style={{ background: cfg.fill, borderColor: cfg.stroke }}
            />
            <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

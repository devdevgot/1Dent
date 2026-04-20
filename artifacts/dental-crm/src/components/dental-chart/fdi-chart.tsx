import { cn } from "@/lib/utils";
import type { ToothCondition, ToothRecord } from "@workspace/api-client-react";

export type { ToothCondition };

export const CONDITION_CONFIG: Record<
  ToothCondition,
  { label: string; crownFill: string; stroke: string; textColor: string }
> = {
  healthy:           { label: "Здоров",      crownFill: "#ffffff",  stroke: "#c8d8c0",  textColor: "#166534" },
  cavity:            { label: "Кариес",      crownFill: "#fde68a",  stroke: "#f59e0b",  textColor: "#92400e" },
  treated:           { label: "Пролечен",    crownFill: "#bfdbfe",  stroke: "#3b82f6",  textColor: "#1e40af" },
  crown:             { label: "Коронка",     crownFill: "#fcd34d",  stroke: "#d97706",  textColor: "#78350f" },
  root_canal:        { label: "Канал",       crownFill: "#fed7aa",  stroke: "#ea580c",  textColor: "#7c2d12" },
  implant:           { label: "Имплант",     crownFill: "#6ee7b7",  stroke: "#10b981",  textColor: "#064e3b" },
  missing:           { label: "Отсутствует", crownFill: "#f3f4f6",  stroke: "#9ca3af",  textColor: "#6b7280" },
  extraction_needed: { label: "Удаление",    crownFill: "#fca5a5",  stroke: "#ef4444",  textColor: "#991b1b" },
};

const ROOT_FILL = "#fef6ee";
const ROOT_STROKE = "#e8d5c0";

export type ToothMap = Map<number, ToothRecord>;

type ToothType = "incisor" | "canine" | "premolar" | "molar";

function getToothType(fdi: number): ToothType {
  const n = fdi % 10;
  if (n === 1 || n === 2) return "incisor";
  if (n === 3) return "canine";
  if (n === 4 || n === 5) return "premolar";
  return "molar";
}

function toothWidth(fdi: number): number {
  switch (getToothType(fdi)) {
    case "molar":    return 26;
    case "premolar": return 20;
    case "canine":   return 18;
    case "incisor":  return 15;
  }
}

const f = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;

function getRootPath(isUpper: boolean, w: number, h: number): string {
  const m = w / 2;
  const rw = w * 0.22;
  const cw = w * 0.46;
  const cej = isUpper ? h * 0.42 : h * 0.58;
  if (isUpper) {
    return `M ${f(m - rw, 0)} L ${f(m + rw, 0)} Q ${f(m + cw, h * 0.09)} ${f(m + cw, cej)} L ${f(m - cw, cej)} Q ${f(m - cw, h * 0.09)} ${f(m - rw, 0)} Z`;
  }
  return `M ${f(m - rw, h)} L ${f(m + rw, h)} Q ${f(m + cw, h * 0.91)} ${f(m + cw, cej)} L ${f(m - cw, cej)} Q ${f(m - cw, h * 0.91)} ${f(m - rw, h)} Z`;
}

function getCrownPath(type: ToothType, isUpper: boolean, w: number, h: number): string {
  const m = w / 2;
  const cw = w * 0.46;
  const cej = isUpper ? h * 0.42 : h * 0.58;

  if (isUpper) {
    const start = `M ${f(m + cw, cej)}`;
    const end   = `L ${f(m - cw, cej)} Z`;
    switch (type) {
      case "incisor":
        return `${start} L ${f(m + cw, h * 0.70)} Q ${f(m + cw * 0.94, h * 0.87)} ${f(m + cw * 0.80, h * 0.96)} Q ${f(m, h)} ${f(m - cw * 0.80, h * 0.96)} Q ${f(m - cw * 0.94, h * 0.87)} ${f(m - cw, h * 0.70)} ${end}`;
      case "canine":
        return `${start} L ${f(m + cw, h * 0.62)} L ${f(m, h)} L ${f(m - cw, h * 0.62)} ${end}`;
      case "premolar":
        return `${start} L ${f(m + cw, h * 0.62)} Q ${f(m + cw * 0.90, h * 0.80)} ${f(m + cw * 0.74, h)} Q ${f(m, h * 0.87)} ${f(m - cw * 0.74, h)} Q ${f(m - cw * 0.90, h * 0.80)} ${f(m - cw, h * 0.62)} ${end}`;
      case "molar":
        return `${start} L ${f(m + cw, h * 0.60)} Q ${f(m + cw * 0.88, h * 0.78)} ${f(m + cw * 0.70, h)} L ${f(m, h * 0.87)} L ${f(m - cw * 0.70, h)} Q ${f(m - cw * 0.88, h * 0.78)} ${f(m - cw, h * 0.60)} ${end}`;
    }
  } else {
    const start = `M ${f(m + cw, cej)}`;
    const end   = `L ${f(m - cw, cej)} Z`;
    switch (type) {
      case "incisor":
        return `${start} L ${f(m + cw, h * 0.30)} Q ${f(m + cw * 0.94, h * 0.13)} ${f(m + cw * 0.80, h * 0.04)} Q ${f(m, 0)} ${f(m - cw * 0.80, h * 0.04)} Q ${f(m - cw * 0.94, h * 0.13)} ${f(m - cw, h * 0.30)} ${end}`;
      case "canine":
        return `${start} L ${f(m + cw, h * 0.38)} L ${f(m, 0)} L ${f(m - cw, h * 0.38)} ${end}`;
      case "premolar":
        return `${start} L ${f(m + cw, h * 0.38)} Q ${f(m + cw * 0.90, h * 0.20)} ${f(m + cw * 0.74, 0)} Q ${f(m, h * 0.13)} ${f(m - cw * 0.74, 0)} Q ${f(m - cw * 0.90, h * 0.20)} ${f(m - cw, h * 0.38)} ${end}`;
      case "molar":
        return `${start} L ${f(m + cw, h * 0.40)} Q ${f(m + cw * 0.88, h * 0.22)} ${f(m + cw * 0.70, 0)} L ${f(m, h * 0.13)} L ${f(m - cw * 0.70, 0)} Q ${f(m - cw * 0.88, h * 0.22)} ${f(m - cw, h * 0.40)} ${end}`;
    }
  }
}

function getFullOutlinePath(type: ToothType, isUpper: boolean, w: number, h: number): string {
  const m = w / 2;
  const rw = w * 0.22;
  const cw = w * 0.46;
  const cej = isUpper ? h * 0.42 : h * 0.58;

  if (isUpper) {
    const rootStart = `M ${f(m - rw, 0)} L ${f(m + rw, 0)} Q ${f(m + cw, h * 0.09)} ${f(m + cw, cej)}`;
    const rootEnd   = `L ${f(m - cw, cej)} Q ${f(m - cw, h * 0.09)} ${f(m - rw, 0)} Z`;
    switch (type) {
      case "incisor":
        return `${rootStart} L ${f(m + cw, h * 0.70)} Q ${f(m + cw * 0.94, h * 0.87)} ${f(m + cw * 0.80, h * 0.96)} Q ${f(m, h)} ${f(m - cw * 0.80, h * 0.96)} Q ${f(m - cw * 0.94, h * 0.87)} ${f(m - cw, h * 0.70)} ${rootEnd}`;
      case "canine":
        return `${rootStart} L ${f(m + cw, h * 0.62)} L ${f(m, h)} L ${f(m - cw, h * 0.62)} ${rootEnd}`;
      case "premolar":
        return `${rootStart} L ${f(m + cw, h * 0.62)} Q ${f(m + cw * 0.90, h * 0.80)} ${f(m + cw * 0.74, h)} Q ${f(m, h * 0.87)} ${f(m - cw * 0.74, h)} Q ${f(m - cw * 0.90, h * 0.80)} ${f(m - cw, h * 0.62)} ${rootEnd}`;
      case "molar":
        return `${rootStart} L ${f(m + cw, h * 0.60)} Q ${f(m + cw * 0.88, h * 0.78)} ${f(m + cw * 0.70, h)} L ${f(m, h * 0.87)} L ${f(m - cw * 0.70, h)} Q ${f(m - cw * 0.88, h * 0.78)} ${f(m - cw, h * 0.60)} ${rootEnd}`;
    }
  } else {
    const rootStart = `M ${f(m - rw, h)} L ${f(m + rw, h)} Q ${f(m + cw, h * 0.91)} ${f(m + cw, cej)}`;
    const rootEnd   = `L ${f(m - cw, cej)} Q ${f(m - cw, h * 0.91)} ${f(m - rw, h)} Z`;
    switch (type) {
      case "incisor":
        return `${rootStart} L ${f(m + cw, h * 0.30)} Q ${f(m + cw * 0.94, h * 0.13)} ${f(m + cw * 0.80, h * 0.04)} Q ${f(m, 0)} ${f(m - cw * 0.80, h * 0.04)} Q ${f(m - cw * 0.94, h * 0.13)} ${f(m - cw, h * 0.30)} ${rootEnd}`;
      case "canine":
        return `${rootStart} L ${f(m + cw, h * 0.38)} L ${f(m, 0)} L ${f(m - cw, h * 0.38)} ${rootEnd}`;
      case "premolar":
        return `${rootStart} L ${f(m + cw, h * 0.38)} Q ${f(m + cw * 0.90, h * 0.20)} ${f(m + cw * 0.74, 0)} Q ${f(m, h * 0.13)} ${f(m - cw * 0.74, 0)} Q ${f(m - cw * 0.90, h * 0.20)} ${f(m - cw, h * 0.38)} ${rootEnd}`;
      case "molar":
        return `${rootStart} L ${f(m + cw, h * 0.40)} Q ${f(m + cw * 0.88, h * 0.22)} ${f(m + cw * 0.70, 0)} L ${f(m, h * 0.13)} L ${f(m - cw * 0.70, 0)} Q ${f(m - cw * 0.88, h * 0.22)} ${f(m - cw, h * 0.40)} ${rootEnd}`;
    }
  }
  return "";
}

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

/** Canal x-offsets (normalised: fraction of half-crown-width cw)
 *  so the positions scale with tooth size */
function getCanalOffsets(count: number): number[] {
  if (count === 1) return [0];
  if (count === 2) return [-0.38, 0.38];
  return [-0.50, 0, 0.50];
}

interface FdiChartProps {
  teethData: ToothMap;
  selectedFdi: number | null;
  onToothClick: (fdi: number) => void;
  inProgressFdi?: number | null;
  className?: string;
}

const UPPER_LEFT  = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_RIGHT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_LEFT  = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_RIGHT = [31, 32, 33, 34, 35, 36, 37, 38];

const UPPER_ROW = [...UPPER_LEFT, ...UPPER_RIGHT];
const LOWER_ROW = [...LOWER_LEFT, ...LOWER_RIGHT];

const GAP = 2;
const CENTER_GAP = 8;

function buildRowPositions(row: number[]): { fdi: number; x: number }[] {
  const positions: { fdi: number; x: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < row.length; i++) {
    const fdi = row[i]!;
    if (i === 8) cursor += CENTER_GAP;
    positions.push({ fdi, x: cursor });
    cursor += toothWidth(fdi) + GAP;
  }
  return positions;
}

const TOOTH_H = 44;
const TOP_PAD = 2;
const MID_GAP = 32;

const upperToothY  = TOP_PAD;
const midlineY     = upperToothY + TOOTH_H + 16;
const lowerToothY  = upperToothY + TOOTH_H + MID_GAP;
const SVG_H        = lowerToothY + TOOTH_H + TOP_PAD;

function ToothGlyph({
  fdi,
  record,
  isSelected,
  isInProgress,
  isUpper,
  onClick,
}: {
  fdi: number;
  record: ToothRecord | undefined;
  isSelected: boolean;
  isInProgress: boolean;
  isUpper: boolean;
  onClick: () => void;
}) {
  const type = getToothType(fdi);
  const condition: ToothCondition = record?.condition ?? "healthy";
  const cfg = CONDITION_CONFIG[condition];
  const w = toothWidth(fdi);
  const h = TOOTH_H;
  const m = w / 2;
  const isMissing = condition === "missing";

  const rootPath    = getRootPath(isUpper, w, h);
  const crownPath   = getCrownPath(type, isUpper, w, h);
  const outlinePath = getFullOutlinePath(type, isUpper, w, h);

  const strokeColor = isSelected ? "#6366f1" : cfg.stroke;
  const strokeW     = isSelected ? 2 : 1.2;

  const canalCount   = getCanalCount(fdi);
  const canalOffsets = getCanalOffsets(canalCount);
  const cw = w * 0.46;
  const cej = isUpper ? h * 0.42 : h * 0.58;
  // Canal ellipse geometry
  const canalRx = canalCount === 1 ? 1.5 : canalCount === 2 ? 1.1 : 0.85;
  // Ry spans most of the root length
  const canalRy     = isUpper ? (cej - h * 0.03) / 2 - 0.5 : (h * 0.97 - cej) / 2 - 0.5;
  const canalCy     = isUpper ? h * 0.03 + canalRy : cej + canalRy + 0.5;
  // Colors: treated canal vs normal anatomy
  const canalFill   = condition === "root_canal" ? "#fde8c8" : "#f5e2c5";
  const canalStroke = condition === "root_canal" ? "#d47a30" : "#c4955a";

  return (
    <g
      className="cursor-pointer"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      role="button"
      tabIndex={0}
      aria-label={`Зуб ${fdi}: ${cfg.label}`}
      aria-pressed={isSelected}
    >
      {/* In-progress pulsing rings */}
      {isInProgress && (
        <>
          <rect
            x={-6} y={-6}
            width={w + 12} height={h + 12}
            rx={8}
            fill="none"
            stroke="#22c55e"
            strokeWidth={2.5}
          >
            <animate attributeName="opacity" values="0.9;0.15;0.9" dur="1.4s" repeatCount="indefinite" />
            <animate attributeName="stroke-width" values="2;4.5;2" dur="1.4s" repeatCount="indefinite" />
          </rect>
          <rect
            x={-10} y={-10}
            width={w + 20} height={h + 20}
            rx={11}
            fill="none"
            stroke="#22c55e"
            strokeWidth={1.2}
          >
            <animate attributeName="opacity" values="0.5;0;0.5" dur="1.4s" begin="0.2s" repeatCount="indefinite" />
          </rect>
        </>
      )}

      {/* Selected ring */}
      {isSelected && !isInProgress && (
        <rect
          x={-4} y={-4}
          width={w + 8} height={h + 8}
          rx={6}
          fill="none"
          stroke="#6366f1"
          strokeWidth={2.5}
          strokeDasharray="0"
          opacity={0.4}
        />
      )}

      {/* Root */}
      <path
        d={rootPath}
        fill={isMissing ? "#f9fafb" : ROOT_FILL}
        stroke={ROOT_STROKE}
        strokeWidth={0.6}
        strokeDasharray={isMissing ? "3 2" : undefined}
      />

      {/* Canal ellipses — drawn inside root, behind crown */}
      {!isMissing && canalOffsets.map((offset, i) => {
        const cx = m + offset * cw * 0.55;
        return (
          <ellipse
            key={i}
            cx={cx}
            cy={canalCy}
            rx={canalRx}
            ry={Math.max(canalRy, 1)}
            fill={canalFill}
            stroke={canalStroke}
            strokeWidth={0.6}
            opacity={0.82}
          />
        );
      })}

      {/* Crown */}
      <path
        d={crownPath}
        fill={isMissing ? "#f3f4f6" : cfg.crownFill}
        stroke="none"
        strokeDasharray={isMissing ? "3 2" : undefined}
      />

      {/* Full outline */}
      <path
        d={outlinePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeW}
        strokeLinejoin="round"
        strokeDasharray={isMissing ? "3 2" : undefined}
        strokeOpacity={isMissing ? 0.7 : 1}
      />

      {/* Missing X */}
      {isMissing && (
        <g opacity={0.5}>
          <line x1={w * 0.28} y1={h * 0.28} x2={w * 0.72} y2={h * 0.72} stroke="#9ca3af" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={w * 0.72} y1={h * 0.28} x2={w * 0.28} y2={h * 0.72} stroke="#9ca3af" strokeWidth={1.5} strokeLinecap="round" />
        </g>
      )}

      {/* CEJ divider line */}
      {!isMissing && (
        <line
          x1={m - w * 0.46}
          y1={cej}
          x2={m + w * 0.46}
          y2={cej}
          stroke={cfg.stroke}
          strokeWidth={0.5}
          strokeOpacity={0.35}
        />
      )}
    </g>
  );
}

export function FdiChart({ teethData, selectedFdi, onToothClick, inProgressFdi, className }: FdiChartProps) {
  const upperPositions = buildRowPositions(UPPER_ROW);
  const lowerPositions = buildRowPositions(LOWER_ROW);

  const lastUpper = upperPositions[upperPositions.length - 1]!;
  const totalWidth = lastUpper.x + toothWidth(UPPER_ROW[UPPER_ROW.length - 1]!);

  return (
    <div className={cn("w-full", className)}>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 360 }}>
          <svg
            viewBox={`-4 0 ${totalWidth + 8} ${SVG_H}`}
            className="w-full select-none"
            style={{ height: "auto" }}
            aria-label="FDI зубная карта"
          >
            {/* Quadrant labels */}
            <text x={2} y={upperToothY + 8} fontSize={7} fill="#c4b5a0" fontFamily="system-ui" fontWeight="600">Q1</text>
            <text x={totalWidth / 2 + 6} y={upperToothY + 8} fontSize={7} fill="#c4b5a0" fontFamily="system-ui" fontWeight="600">Q2</text>
            <text x={2} y={lowerToothY + TOOTH_H - 2} fontSize={7} fill="#c4b5a0" fontFamily="system-ui" fontWeight="600">Q4</text>
            <text x={totalWidth / 2 + 6} y={lowerToothY + TOOTH_H - 2} fontSize={7} fill="#c4b5a0" fontFamily="system-ui" fontWeight="600">Q3</text>

            {/* Upper row */}
            {upperPositions.map(({ fdi, x }) => (
              <g key={fdi} transform={`translate(${x}, ${upperToothY})`}>
                <ToothGlyph
                  fdi={fdi}
                  record={teethData.get(fdi)}
                  isSelected={selectedFdi === fdi}
                  isInProgress={inProgressFdi === fdi}
                  isUpper={true}
                  onClick={() => onToothClick(fdi)}
                />
                {/* Upper label below crown */}
                <text
                  x={toothWidth(fdi) / 2}
                  y={TOOTH_H + 11}
                  textAnchor="middle"
                  fontSize={7.5}
                  fontFamily="system-ui"
                  fontWeight={selectedFdi === fdi ? "700" : "500"}
                  fill={selectedFdi === fdi ? "#6366f1" : "#94a3b8"}
                >
                  {fdi}
                </text>
              </g>
            ))}

            {/* Midline */}
            <line
              x1={0} y1={midlineY}
              x2={totalWidth} y2={midlineY}
              stroke="#e2e8f0"
              strokeWidth={1}
              strokeDasharray="5 3"
            />

            {/* Lower row */}
            {lowerPositions.map(({ fdi, x }) => (
              <g key={fdi} transform={`translate(${x}, ${lowerToothY})`}>
                {/* Lower label above crown */}
                <text
                  x={toothWidth(fdi) / 2}
                  y={-5}
                  textAnchor="middle"
                  fontSize={7.5}
                  fontFamily="system-ui"
                  fontWeight={selectedFdi === fdi ? "700" : "500"}
                  fill={selectedFdi === fdi ? "#6366f1" : "#94a3b8"}
                >
                  {fdi}
                </text>
                <ToothGlyph
                  fdi={fdi}
                  record={teethData.get(fdi)}
                  isSelected={selectedFdi === fdi}
                  isInProgress={inProgressFdi === fdi}
                  isUpper={false}
                  onClick={() => onToothClick(fdi)}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Legend — conditions */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 px-0.5">
        {(Object.entries(CONDITION_CONFIG) as [ToothCondition, (typeof CONDITION_CONFIG)[ToothCondition]][]).map(
          ([cond, cfg]) => (
            <div key={cond} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded border shrink-0"
                style={{ background: cfg.crownFill, borderColor: cfg.stroke }}
              />
              <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
            </div>
          ),
        )}
      </div>

      {/* Legend — canal count */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-0.5 border-t border-border/30 pt-2">
        <span className="text-[10px] text-muted-foreground font-medium self-center">Каналы:</span>
        {([
          { label: "1 канал",    offsets: [0],              rx: 1.5 },
          { label: "2 канала",   offsets: [-0.38, 0.38],    rx: 1.1 },
          { label: "3 канала",   offsets: [-0.5, 0, 0.5],   rx: 0.85 },
        ] as const).map(({ label, offsets, rx }) => (
          <div key={label} className="flex items-center gap-1.5">
            <svg width="20" height="9" viewBox="0 0 20 9">
              <rect x="1" y="0.5" width="18" height="8" rx="2.5" fill="#fef6ee" stroke="#e8d5c0" strokeWidth="0.7" />
              {(offsets as readonly number[]).map((o, i) => (
                <ellipse key={i} cx={10 + o * 14} cy="4.5" rx={rx} ry={3.2} fill="#f5e2c5" stroke="#c4955a" strokeWidth="0.6" />
              ))}
            </svg>
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

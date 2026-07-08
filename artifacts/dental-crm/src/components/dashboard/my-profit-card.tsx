import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/hooks/use-auth";
import { useBranchStore, type ClinicBranch } from "@/hooks/use-branch-store";
import { fetchBranchRevenue } from "@/lib/branch-scoped-fetch";
import {
  fmtRevenue,
  getPresetRange,
  LIST_PERIOD_PRESETS,
  type FilterPreset,
} from "@/components/dashboard/owner-dashboard-shared";
import { format } from "date-fns";

const BRANCH_ICON = "/icons/menu/clinic-branches.png";
const MAIN_ICON = "/icons/menu/dashboard.png";

const ROW_ICON_BGS = ["#EAF3FF", "#EDFBF2", "#F3EFFF", "#FFF7E8", "#FEF0F0"];

export type ProfitBranchTarget = {
  id: string | null;
  name: string;
};

type BranchRow = ProfitBranchTarget & {
  subtitle: string;
  revenue: number | null;
  iconBg: string;
  iconSrc: string;
};

type MyProfitCardProps = {
  listPreset: FilterPreset;
  onListPresetChange: (preset: FilterPreset) => void;
  onSelectBranch: (target: ProfitBranchTarget) => void;
};

export function MyProfitCard({ listPreset, onListPresetChange, onSelectBranch }: MyProfitCardProps) {
  const [, navigate] = useLocation();
  const { clinic } = useAuthStore();
  const { branches, fetchBranches, hasFetched } = useBranchStore();
  const [revenues, setRevenues] = useState<Record<string, number>>({});
  const [loadingRevenues, setLoadingRevenues] = useState(false);

  useEffect(() => {
    if (!hasFetched) void fetchBranches();
  }, [hasFetched, fetchBranches]);

  const dateRange = useMemo(() => {
    const range = getPresetRange(listPreset);
    const to = new Date(range.to);
    to.setHours(23, 59, 59, 999);
    return { from: range.from, to };
  }, [listPreset]);

  const dateFromStr = format(dateRange.from, "yyyy-MM-dd");
  const dateToStr = format(dateRange.to, "yyyy-MM-dd");

  const rows: BranchRow[] = useMemo(() => {
    const mainName = clinic?.name?.trim() || "Главный офис";
    const mainKey = "__main__";
    const list: BranchRow[] = [
      {
        id: null,
        name: mainName,
        subtitle: "Основная клиника",
        revenue: revenues[mainKey] ?? null,
        iconBg: ROW_ICON_BGS[0],
        iconSrc: MAIN_ICON,
      },
      ...branches.map((b: ClinicBranch, i) => ({
        id: b.id,
        name: b.name,
        subtitle: `Филиал · ${b.id.slice(-4).toUpperCase()}`,
        revenue: revenues[b.id] ?? null,
        iconBg: ROW_ICON_BGS[(i + 1) % ROW_ICON_BGS.length],
        iconSrc: BRANCH_ICON,
      })),
    ];
    return list;
  }, [branches, clinic?.name, revenues]);

  useEffect(() => {
    let cancelled = false;
    setLoadingRevenues(true);

    void (async () => {
      const entries: Record<string, number> = {};
      try {
        const mainRev = await fetchBranchRevenue(null, dateFromStr, dateToStr);
        entries.__main__ = mainRev;
        await Promise.all(
          branches.map(async (b) => {
            entries[b.id] = await fetchBranchRevenue(b.id, dateFromStr, dateToStr);
          }),
        );
      } catch {
        /* keep partial data */
      }
      if (!cancelled) {
        setRevenues(entries);
        setLoadingRevenues(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branches, dateFromStr, dateToStr]);

  return (
    <div className="mx-4 mt-4 bg-white rounded-3xl border border-[#e8e3d9] shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h2 className="text-[22px] font-bold text-[#0f172a] tracking-tight">Мой прибыль</h2>
        <div
          className="flex gap-2 mt-3 overflow-x-auto pb-0.5"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {LIST_PERIOD_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onListPresetChange(p.key)}
              className={cn(
                "shrink-0 px-3.5 py-2 rounded-full text-[13px] font-semibold border transition-colors",
                listPreset === p.key
                  ? "bg-[#0f172a] text-white border-[#0f172a]"
                  : "bg-white text-[#0f172a] border-[#e8e3d9] hover:bg-[#faf8f4]",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-[#f1ede4]">
        {rows.map((row) => (
          <button
            key={row.id ?? "main"}
            type="button"
            onClick={() => onSelectBranch({ id: row.id, name: row.name })}
            className="flex items-center gap-3.5 w-full px-5 py-3.5 text-left hover:bg-[#faf8f4] active:bg-[#f1ede4] transition-colors"
          >
            <div
              className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center shrink-0 overflow-hidden"
              style={{ backgroundColor: row.iconBg }}
            >
              <img
                src={row.iconSrc}
                alt=""
                aria-hidden
                className="w-[44px] h-[44px] object-contain drop-shadow-sm"
                draggable={false}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[15px] text-[#0f172a] truncate">{row.name}</p>
              <p className="text-[13px] text-[#64748b] mt-0.5 truncate">{row.subtitle}</p>
            </div>
            <div className="shrink-0 text-right">
              {loadingRevenues || row.revenue === null ? (
                <Loader2 className="w-4 h-4 text-[#94a3b8] animate-spin ml-auto" />
              ) : (
                <p className="font-bold text-[15px] text-[#0f172a] tabular-nums">
                  {fmtRevenue(row.revenue)}
                </p>
              )}
            </div>
          </button>
        ))}

        {hasFetched && branches.length === 0 && (
          <p className="px-5 py-4 text-sm text-[#64748b] text-center">
            Добавьте филиалы, чтобы видеть прибыль по каждой точке
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => navigate("/clinic-branches")}
        className="mx-4 my-4 w-[calc(100%-2rem)] py-3.5 rounded-2xl bg-[#f1ede4] hover:bg-[#e8e3d9] text-[#0f172a] text-[15px] font-semibold transition-colors flex items-center justify-center gap-1"
      >
        Управление филиалами
        <ChevronRight className="w-4 h-4 text-[#64748b]" />
      </button>
    </div>
  );
}

import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  AlertTriangle,
  ChevronLeft,
  RefreshCw,
  CreditCard,
  TrendingUp,
  Zap,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiCreditsSummary, useAiCreditsUsage } from "@/hooks/use-ai-credits";
import { useAuthStore } from "@/hooks/use-auth";

function formatNumber(n: number) {
  return n.toLocaleString("ru-RU");
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AiCreditsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const isOwner = user?.role === "owner";
  const { data: summary, isLoading, isError, error, refetch, isFetching } = useAiCreditsSummary();
  const { data: usage = [], isLoading: usageLoading, isError: usageError } = useAiCreditsUsage(100);
  const errorMessage =
    (error as { data?: { error?: string }; message?: string } | null)?.data?.error ??
    (error as Error | null)?.message;

  const usedPercent =
    summary && summary.totalAvailable > 0
      ? Math.min(100, Math.round((summary.usedThisMonth / summary.totalAvailable) * 100))
      : 0;

  return (
    <div className="min-h-full bg-[#f2f2f7] pb-8">
      <div className="bg-white border-b border-border/40 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link
            href="/menu"
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">
              {t("aiCredits.title")}
            </h1>
            <p className="text-xs text-gray-400 truncate">{t("aiCredits.subtitle")}</p>
          </div>
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
            aria-label={t("aiCredits.refresh")}
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-2xl mx-auto">
        {isLoading && (
          <div className="bg-white rounded-2xl p-6 animate-pulse h-40" />
        )}

        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700 space-y-2">
            <p>{t("aiCredits.loadError")}</p>
            {errorMessage && (
              <p className="text-xs text-red-600/80 break-words">{errorMessage}</p>
            )}
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-xs font-semibold text-red-800 underline"
            >
              {t("aiCredits.refresh")}
            </button>
          </div>
        )}

        {!isLoading && !isError && !summary && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
            {t("aiCredits.emptyState")}
          </div>
        )}

        {summary?.exhausted && (
          <div className="bg-red-50 border border-red-300 rounded-2xl p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-red-800 text-sm">{t("aiCredits.exhaustedTitle")}</p>
              <p className="text-xs text-red-700 mt-1 leading-relaxed">{t("aiCredits.exhaustedDesc")}</p>
              {isOwner && (
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-red-800 underline"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  {t("aiCredits.buyMore")}
                </Link>
              )}
            </div>
          </div>
        )}

        {summary && (
          <>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-border/30">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t("aiCredits.available")}
                  </p>
                  <p className="text-3xl font-bold text-primary mt-1">
                    {formatNumber(summary.remaining)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {t("aiCredits.ofTotal", { total: formatNumber(summary.totalAvailable) })}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
              </div>

              <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                <span>{t("aiCredits.usedThisMonth", { month: summary.monthLabel })}</span>
                <span className="font-semibold">{formatNumber(summary.usedThisMonth)}</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    usedPercent >= 90 ? "bg-red-500" : usedPercent >= 70 ? "bg-amber-500" : "bg-primary",
                  )}
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">{usedPercent}% {t("aiCredits.used")}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl p-4 border border-border/30">
                <div className="flex items-center gap-2 text-gray-400 mb-2">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">
                    {t("aiCredits.monthlyLimit")}
                  </span>
                </div>
                <p className="text-xl font-bold text-gray-900">{formatNumber(summary.monthlyLimit)}</p>
                <p className="text-[11px] text-gray-400 mt-1">{t(`aiCredits.plan.${summary.plan}`)}</p>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-border/30">
                <div className="flex items-center gap-2 text-gray-400 mb-2">
                  <Zap className="w-4 h-4" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">
                    {t("aiCredits.bonusCredits")}
                  </span>
                </div>
                <p className="text-xl font-bold text-gray-900">{formatNumber(summary.bonusCredits)}</p>
                <p className="text-[11px] text-gray-400 mt-1">{t("aiCredits.bonusHint")}</p>
              </div>
            </div>
          </>
        )}

        <div className="bg-white rounded-2xl border border-border/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <History className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-800">{t("aiCredits.historyTitle")}</h2>
          </div>

          {usageLoading && (
            <div className="p-6 text-sm text-gray-400 text-center">{t("aiCredits.loading")}</div>
          )}

          {usageError && (
            <div className="p-6 text-sm text-red-600 text-center">{t("aiCredits.historyError")}</div>
          )}

          {!usageLoading && !usageError && usage.length === 0 && (
            <div className="p-8 text-center">
              <Sparkles className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">{t("aiCredits.noUsage")}</p>
            </div>
          )}

          {!usageLoading && !usageError && usage.length > 0 && (
            <div className="divide-y divide-gray-100">
              {usage.map((row) => (
                <div key={row.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-primary">-{row.credits}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{row.featureLabel}</p>
                    {row.description && row.description !== row.featureLabel && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{row.description}</p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-1">
                      {formatDateTime(row.createdAt)}
                      {row.userName ? ` · ${row.userName}` : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {isOwner && (
          <Link
            href="/pricing"
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-primary text-white rounded-2xl text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            {t("aiCredits.upgradePlan")}
          </Link>
        )}
      </div>
    </div>
  );
}

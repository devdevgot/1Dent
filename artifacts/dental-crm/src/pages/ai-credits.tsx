import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  AlertTriangle,
  RefreshCw,
  CreditCard,
  TrendingUp,
  Zap,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAiCreditsSummary, useAiCreditsUsage } from "@/hooks/use-ai-credits";
import { useAuthStore } from "@/hooks/use-auth";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";

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
  const [, setLocation] = useLocation();
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
    <PageShell className="pb-8">
      <PageHeader
        title={t("aiCredits.title")}
        onBack={() => setLocation("/menu")}
        sticky
        right={
          <button
            onClick={() => void refetch()}
            disabled={isFetching}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[var(--surface-2)] text-[var(--text-secondary)] transition-colors disabled:opacity-50"
            aria-label={t("aiCredits.refresh")}
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </button>
        }
      />

      <div className="px-4 pt-4 space-y-4 max-w-2xl mx-auto">
        <p className="text-xs text-[var(--text-subtle)] -mt-2">{t("aiCredits.subtitle")}</p>
        {isLoading && (
          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-md p-6 animate-pulse h-40" />
        )}

        {isError && (
          <div className="bg-[var(--danger-light)] border border-[var(--danger-light)] rounded-2xl p-4 text-sm text-[var(--danger)] space-y-2">
            <p>{t("aiCredits.loadError")}</p>
            {errorMessage && (
              <p className="text-xs text-[var(--danger)]/80 break-words">{errorMessage}</p>
            )}
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-xs font-semibold text-[var(--danger)] underline"
            >
              {t("aiCredits.refresh")}
            </button>
          </div>
        )}

        {!isLoading && !isError && !summary && (
          <div className="bg-[var(--warning-light)] border border-[var(--warning-light)] rounded-2xl p-4 text-sm text-[var(--warning)]">
            {t("aiCredits.emptyState")}
          </div>
        )}

        {summary?.exhausted && (
          <div className="bg-[var(--danger-light)] border border-[var(--danger-light)] rounded-2xl p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-[var(--danger)] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[var(--danger)] text-sm">{t("aiCredits.exhaustedTitle")}</p>
              <p className="text-xs text-[var(--danger)] mt-1 leading-relaxed">{t("aiCredits.exhaustedDesc")}</p>
              {isOwner && (
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-[var(--danger)] underline"
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
            <div className="bg-[var(--surface)] rounded-2xl p-5 shadow-md border border-[var(--border)]">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">
                    {t("aiCredits.available")}
                  </p>
                  <p className="text-3xl font-bold text-[var(--primary)] mt-1">
                    {formatNumber(summary.remaining)}
                  </p>
                  <p className="text-xs text-[var(--text-subtle)] mt-1">
                    {t("aiCredits.ofTotal", { total: formatNumber(summary.totalAvailable) })}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-[var(--primary-light)] flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-[var(--primary)]" />
                </div>
              </div>

              <div className="mb-2 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <span>{t("aiCredits.usedThisMonth", { month: summary.monthLabel })}</span>
                <span className="font-semibold">{formatNumber(summary.usedThisMonth)}</span>
              </div>
              <div className="h-2.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    usedPercent >= 90 ? "bg-[var(--danger)]" : usedPercent >= 70 ? "bg-[var(--warning)]" : "bg-[var(--primary)]",
                  )}
                  style={{ width: `${usedPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-[var(--text-subtle)] mt-1.5">{usedPercent}% {t("aiCredits.used")}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)] shadow-md">
                <div className="flex items-center gap-2 text-[var(--text-subtle)] mb-2">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">
                    {t("aiCredits.monthlyLimit")}
                  </span>
                </div>
                <p className="text-xl font-bold text-[var(--text)]">{formatNumber(summary.monthlyLimit)}</p>
                <p className="text-[11px] text-[var(--text-subtle)] mt-1">{t(`aiCredits.plan.${summary.plan}`)}</p>
              </div>
              <div className="bg-[var(--surface)] rounded-2xl p-4 border border-[var(--border)] shadow-md">
                <div className="flex items-center gap-2 text-[var(--text-subtle)] mb-2">
                  <Zap className="w-4 h-4" />
                  <span className="text-[11px] font-medium uppercase tracking-wider">
                    {t("aiCredits.bonusCredits")}
                  </span>
                </div>
                <p className="text-xl font-bold text-[var(--text)]">{formatNumber(summary.bonusCredits)}</p>
                <p className="text-[11px] text-[var(--text-subtle)] mt-1">{t("aiCredits.bonusHint")}</p>
              </div>
            </div>
          </>
        )}

        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-md overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--text-subtle)]" />
            <h2 className="text-sm font-semibold text-[var(--text)]">{t("aiCredits.historyTitle")}</h2>
          </div>

          {usageLoading && (
            <div className="p-6 text-sm text-[var(--text-subtle)] text-center">{t("aiCredits.loading")}</div>
          )}

          {usageError && (
            <div className="p-6 text-sm text-[var(--danger)] text-center">{t("aiCredits.historyError")}</div>
          )}

          {!usageLoading && !usageError && usage.length === 0 && (
            <div className="p-8 text-center">
              <Sparkles className="w-8 h-8 text-[var(--border)] mx-auto mb-2" />
              <p className="text-sm text-[var(--text-subtle)]">{t("aiCredits.noUsage")}</p>
            </div>
          )}

          {!usageLoading && !usageError && usage.length > 0 && (
            <div className="divide-y divide-[var(--border)]">
              {usage.map((row) => (
                <div key={row.id} className="px-4 py-3 flex items-start gap-3 hover:bg-[var(--bg)] transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-[var(--primary-light)] flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-[var(--primary)]">-{row.credits}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text)] truncate">{row.featureLabel}</p>
                    {row.description && row.description !== row.featureLabel && (
                      <p className="text-xs text-[var(--text-subtle)] truncate mt-0.5">{row.description}</p>
                    )}
                    <p className="text-[11px] text-[var(--text-subtle)] mt-1">
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
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-[var(--primary)] text-white rounded-full text-sm font-semibold shadow-md hover:bg-[var(--primary-hover)] hover:scale-105 transition-all"
          >
            <CreditCard className="w-4 h-4" />
            {t("aiCredits.upgradePlan")}
          </Link>
        )}
      </div>
    </PageShell>
  );
}

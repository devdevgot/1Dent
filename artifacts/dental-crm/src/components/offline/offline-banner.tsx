import { CloudOff, RefreshCw, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOfflineSyncState } from "@/hooks/use-offline-sync";
import { flushOutbox } from "@/lib/offline";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function OfflineBanner() {
  const { t } = useTranslation();
  const state = useOfflineSyncState();

  if (state.online && state.pendingCount === 0 && state.conflictCount === 0) {
    return null;
  }

  const isConflict = state.conflictCount > 0;
  const isOffline = !state.online;

  return (
    <div
      role="status"
      className={cn(
        "sticky top-0 z-[60] flex items-center justify-between gap-3 px-4 py-2 text-sm",
        isConflict
          ? "bg-amber-500 text-white"
          : isOffline
            ? "bg-slate-800 text-white"
            : "bg-[#1f75fe] text-white",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {isConflict ? (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        ) : isOffline ? (
          <CloudOff className="h-4 w-4 shrink-0" />
        ) : (
          <RefreshCw
            className={cn("h-4 w-4 shrink-0", state.syncing && "animate-spin")}
          />
        )}
        <span className="truncate">
          {isConflict
            ? t("offline.conflictBanner", { count: state.conflictCount })
            : isOffline
              ? t("offline.offlineBanner", { count: state.pendingCount })
              : t("offline.syncingBanner", { count: state.pendingCount })}
        </span>
      </div>
      {state.online && state.pendingCount > 0 && !isConflict && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 shrink-0 bg-white/15 text-white hover:bg-white/25"
          disabled={state.syncing}
          onClick={() => void flushOutbox()}
        >
          {t("offline.syncNow")}
        </Button>
      )}
    </div>
  );
}

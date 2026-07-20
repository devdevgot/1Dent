import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSyncConflicts } from "@/hooks/use-offline-sync";
import { resolveConflict } from "@/lib/offline";

function summarizeEntity(value: unknown): string {
  if (!value || typeof value !== "object") return "—";
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof obj.name === "string") parts.push(obj.name);
  if (typeof obj.status === "string") parts.push(`status: ${obj.status}`);
  if (typeof obj.condition === "string") parts.push(`condition: ${obj.condition}`);
  if (typeof obj.notes === "string" && obj.notes) parts.push(`notes: ${obj.notes}`);
  if (typeof obj.updatedAt === "string") parts.push(`updatedAt: ${obj.updatedAt}`);
  return parts.join(" · ") || JSON.stringify(obj).slice(0, 160);
}

export function SyncConflictDialog() {
  const { t } = useTranslation();
  const conflicts = useSyncConflicts();
  const [busy, setBusy] = useState(false);
  const current = conflicts[0] ?? null;
  const open = Boolean(current);

  const localSummary = useMemo(
    () => (current ? summarizeEntity(current.localPayload) : ""),
    [current],
  );
  const serverSummary = useMemo(
    () => (current ? summarizeEntity(current.serverCurrent) : ""),
    [current],
  );

  if (!current) return null;

  const handle = async (resolution: "keep_local" | "keep_server") => {
    setBusy(true);
    try {
      await resolveConflict(current.outboxId, resolution);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-md gap-4 font-manrope"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("offline.conflictTitle")}</DialogTitle>
          <DialogDescription>{t("offline.conflictDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("offline.yourChange")}
            </div>
            <p className="text-slate-800">{localSummary}</p>
          </div>
          <div className="rounded-xl bg-amber-50 px-3 py-2">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
              {t("offline.serverChange")}
            </div>
            <p className="text-slate-800">{serverSummary}</p>
          </div>
          {current.message ? (
            <p className="text-xs text-slate-500">{current.message}</p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void handle("keep_server")}
          >
            {t("offline.keepServer")}
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void handle("keep_local")}
          >
            {t("offline.keepLocal")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

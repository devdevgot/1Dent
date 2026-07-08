import { useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useTabletLinkFlow } from "@/hooks/use-tablet-link-flow";
import { TabletPairingCodeModal } from "@/components/tablet/tablet-pairing-code-modal";
import { parseTabletLinkToken } from "@/lib/tablet-api";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function TabletLinkPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const {
    pairingCodeOpen,
    pairingCode,
    cabinetName,
    resendingPairing,
    confirmingPairing,
    submitting,
    status,
    errorMessage,
    processToken,
    resendPairingCode,
    confirmPairing,
    closePairingModal,
  } = useTabletLinkFlow();
  const token = parseTabletLinkToken(new URLSearchParams(search).get("token") ?? "");

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      const returnTo = `/tablet/link${search ? `?${search}` : ""}`;
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    if (token && status === "idle") {
      void processToken(token);
    }
  }, [isLoading, isAuthenticated, token, search, navigate, processToken, status]);

  const dashboardPath = user ? getRoleDashboardPath(user.role) : "/dashboard";

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[var(--bg)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--ds-primary)]" />
      </div>
    );
  }

  const showProcessing = submitting || status === "processing";
  const showSuccess = status === "success" && !pairingCodeOpen && !submitting;
  const showPairingPending = status === "pairing_pending" && !pairingCodeOpen && !submitting;
  const showError = status === "error" && !pairingCodeOpen && !submitting;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[var(--bg)] px-6 font-manrope">
      <div className="w-full max-w-md rounded-3xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-8 text-center shadow-sm">
        {showProcessing && (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[var(--ds-primary)]" />
            <p className="text-base font-bold text-[var(--text)]">Подключаем планшет…</p>
          </>
        )}

        {showPairingPending && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[var(--ds-primary)]" />
            <p className="text-base font-bold text-[var(--text)]">Запрос отправлен</p>
            <p className="mt-2 text-body text-[var(--text-secondary)]">
              Владелец клиники получит код для подтверждения подключения планшета
            </p>
            <button
              type="button"
              onClick={() => navigate(dashboardPath)}
              className="mt-6 rounded-xl bg-[#1f75fe] px-5 py-3 text-body font-semibold text-white"
            >
              На главную
            </button>
          </>
        )}

        {showSuccess && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[var(--success)]" />
            <p className="text-base font-bold text-[var(--text)]">Планшет разблокирован</p>
            <p className="mt-2 text-body text-[var(--text-secondary)]">Можно вернуться к работе в CRM</p>
            <button
              type="button"
              onClick={() => navigate(dashboardPath)}
              className="mt-6 rounded-xl bg-[#1f75fe] px-5 py-3 text-body font-semibold text-white"
            >
              На главную
            </button>
          </>
        )}

        {showError && (
          <>
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-[var(--danger)]" />
            <p className="text-base font-bold text-[var(--text)]">Не удалось подключиться</p>
            <p className="mt-2 text-body text-[var(--text-secondary)]">{errorMessage ?? "Попробуйте отсканировать QR снова"}</p>
            <button
              type="button"
              onClick={() => token && void processToken(token)}
              className="mt-6 rounded-xl bg-[#1f75fe] px-5 py-3 text-body font-semibold text-white"
            >
              Повторить
            </button>
          </>
        )}

        {!showProcessing && !showSuccess && !showPairingPending && !showError && !token && (
          <>
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-[var(--danger)]" />
            <p className="text-base font-bold text-[var(--text)]">Ссылка недействительна</p>
            <p className="mt-2 text-body text-[var(--text-secondary)]">Отсканируйте актуальный QR-код на планшете</p>
          </>
        )}
      </div>

      <TabletPairingCodeModal
        open={pairingCodeOpen}
        onClose={closePairingModal}
        code={pairingCode}
        cabinetName={cabinetName}
        onResend={() => void resendPairingCode()}
        onConfirm={() => void confirmPairing()}
        resending={resendingPairing}
        confirming={confirmingPairing}
      />
    </div>
  );
}

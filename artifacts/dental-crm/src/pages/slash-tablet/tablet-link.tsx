import { useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useTabletLinkFlow } from "@/hooks/use-tablet-link-flow";
import { TabletPairingConfirmModal } from "@/components/tablet/tablet-pairing-confirm-modal";
import { TabletNotPairedModal } from "@/components/tablet/tablet-not-paired-modal";
import { parseTabletLinkToken } from "@/lib/tablet-api";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function TabletLinkPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const {
    pairingModalOpen,
    cabinetName,
    confirmingPairing,
    submitting,
    status,
    errorMessage,
    notPairedModalOpen,
    closeNotPairedModal,
    processToken,
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
      <div className="flex h-[100dvh] items-center justify-center bg-[#faf8f4]">
        <Loader2 className="h-8 w-8 animate-spin text-[#1f75fe]" />
      </div>
    );
  }

  const showProcessing = submitting || status === "processing";
  const showSuccess = status === "success" && !pairingModalOpen && !submitting;
  const showError = status === "error" && !pairingModalOpen && !submitting && !notPairedModalOpen;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#faf8f4] px-6 font-manrope">
      <div className="w-full max-w-md rounded-3xl border border-[#e8e3d9] bg-white p-8 text-center shadow-sm">
        {showProcessing && (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[#1f75fe]" />
            <p className="text-base font-bold text-[#0f172a]">Подключаем планшет…</p>
          </>
        )}

        {showSuccess && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[#16a34a]" />
            <p className="text-base font-bold text-[#0f172a]">Планшет разблокирован</p>
            <p className="mt-2 text-sm text-[#64748b]">Можно вернуться к работе в CRM</p>
            <button
              type="button"
              onClick={() => navigate(dashboardPath)}
              className="mt-6 rounded-xl bg-[#1f75fe] px-5 py-3 text-sm font-semibold text-white"
            >
              На главную
            </button>
          </>
        )}

        {showError && (
          <>
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-[#dc2626]" />
            <p className="text-base font-bold text-[#0f172a]">Не удалось подключиться</p>
            <p className="mt-2 text-sm text-[#64748b]">{errorMessage ?? "Попробуйте отсканировать QR снова"}</p>
            <button
              type="button"
              onClick={() => token && void processToken(token)}
              className="mt-6 rounded-xl bg-[#1f75fe] px-5 py-3 text-sm font-semibold text-white"
            >
              Повторить
            </button>
          </>
        )}

        {!showProcessing && !showSuccess && !showError && !token && (
          <>
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-[#dc2626]" />
            <p className="text-base font-bold text-[#0f172a]">Ссылка недействительна</p>
            <p className="mt-2 text-sm text-[#64748b]">Отсканируйте актуальный QR-код на планшете</p>
          </>
        )}
      </div>

      <TabletPairingConfirmModal
        open={pairingModalOpen}
        onClose={closePairingModal}
        cabinetName={cabinetName}
        onConfirm={() => void confirmPairing()}
        confirming={confirmingPairing}
      />
      <TabletNotPairedModal
        open={notPairedModalOpen}
        onClose={closeNotPairedModal}
      />
    </div>
  );
}

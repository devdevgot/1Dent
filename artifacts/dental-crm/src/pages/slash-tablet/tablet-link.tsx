import { useEffect, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useTabletLinkFlow } from "@/hooks/use-tablet-link-flow";
import { TabletPinSetupModal } from "@/components/tablet/tablet-pin-setup-modal";
import { TabletPinEntryModal } from "@/components/tablet/tablet-pin-entry-modal";
import { parseTabletLinkToken } from "@/lib/tablet-api";
import { getRoleDashboardPath } from "@/lib/role-redirect";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function TabletLinkPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const {
    pinSetupOpen,
    pinEntryOpen,
    submitting,
    processToken,
    submitPinSetup,
    submitPinEntry,
    closeModals,
  } = useTabletLinkFlow();
  const token = parseTabletLinkToken(new URLSearchParams(search).get("token") ?? "");
  const processedRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      const returnTo = `/tablet/link${search ? `?${search}` : ""}`;
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }

    if (token && !processedRef.current) {
      processedRef.current = true;
      void processToken(token);
    }
  }, [isLoading, isAuthenticated, token, search, navigate, processToken]);

  const dashboardPath = user ? getRoleDashboardPath(user.role) : "/dashboard";

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#faf8f4]">
        <Loader2 className="h-8 w-8 animate-spin text-[#1f75fe]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#faf8f4] px-6 font-manrope">
      <div className="w-full max-w-md rounded-3xl border border-[#e8e3d9] bg-white p-8 text-center shadow-sm">
        {pinSetupOpen || pinEntryOpen || submitting ? (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[#1f75fe]" />
            <p className="text-base font-bold text-[#0f172a]">
              {pinSetupOpen ? "Настройка PIN-кода" : "Подключаем планшет…"}
            </p>
          </>
        ) : (
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
      </div>

      <TabletPinSetupModal
        open={pinSetupOpen}
        onClose={closeModals}
        onSubmit={submitPinSetup}
        loading={submitting}
      />
      <TabletPinEntryModal
        open={pinEntryOpen}
        onClose={closeModals}
        onSubmit={submitPinEntry}
        loading={submitting}
      />
    </div>
  );
}

import { useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useTabletLinkFlow } from "@/hooks/use-tablet-link-flow";
import { TabletPinSetupModal } from "@/components/tablet/tablet-pin-setup-modal";
import { parseTabletLinkToken } from "@/lib/tablet-api";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function TabletLinkPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuthStore();
  const { pinSetupOpen, submitting, processToken, submitPinSetup, closeModals } = useTabletLinkFlow();
  const token = parseTabletLinkToken(new URLSearchParams(search).get("token") ?? "");

  useEffect(() => {
    if (!isAuthenticated) {
      const returnTo = `/tablet/link${search ? `?${search}` : ""}`;
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (token) void processToken(token);
  }, [isAuthenticated, token, search, navigate, processToken]);

  if (!isAuthenticated) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#faf8f4]">
        <Loader2 className="h-8 w-8 animate-spin text-[#1f75fe]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#faf8f4] px-6 font-manrope">
      <div className="w-full max-w-md rounded-3xl border border-[#e8e3d9] bg-white p-8 text-center shadow-sm">
        {pinSetupOpen ? (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[#1f75fe]" />
            <p className="text-base font-bold text-[#0f172a]">Настройка PIN-кода</p>
          </>
        ) : submitting ? (
          <>
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[#1f75fe]" />
            <p className="text-base font-bold text-[#0f172a]">Подключаем планшет…</p>
          </>
        ) : (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[#16a34a]" />
            <p className="text-base font-bold text-[#0f172a]">Готово</p>
            <p className="mt-2 text-sm text-[#64748b]">Можно вернуться к планшету в кабинете</p>
            <button
              type="button"
              onClick={() => navigate("/dashboard/doctor")}
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
    </div>
  );
}

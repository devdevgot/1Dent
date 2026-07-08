import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Lock, Loader2 } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ListRowsSkeleton } from "@/components/skeletons";
import { ChannelsSettings } from "@/components/channels/channels-settings";
import { WhatsAppConnectModal, WhatsAppIcon, type WaStatus } from "@/components/whatsapp/whatsapp-connect-modal";
import { customFetch } from "@workspace/api-client-react";
import { useAuthStore } from "@/hooks/use-auth";

export default function ChannelsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const isOwner = user?.role === "owner";

  const [waStatus, setWaStatus] = useState<WaStatus | null>(null);
  const [waLoading, setWaLoading] = useState(true);
  const [waStatusError, setWaStatusError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchStatus = useCallback(async () => {
    setWaLoading(true);
    try {
      const res = await customFetch<{ success: boolean; data: WaStatus }>(
        "/api/clinic/green-api/status",
      );
      setWaStatus(res.data);
      setWaStatusError(false);
    } catch {
      setWaStatus(null);
      setWaStatusError(true);
    } finally {
      setWaLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const isConnected = waStatus?.connected;
  const isBlocked = !waLoading && !waStatusError && !isConnected;

  return (
    <PageShell className="pb-8">
      <PageHeader
        title={t("channels.sectionTitle", { defaultValue: "Каналы привлечения" })}
        onBack={() => window.history.back()}
      />

      <div className="px-4 pt-4 relative">
        {waLoading ? (
          <ListRowsSkeleton rows={3} avatar card />
        ) : isBlocked ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg mb-5"
              style={{ backgroundColor: "#25d366" + "20" }}
            >
              <WhatsAppIcon size={46} color="#25d366" />
            </div>

            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-[var(--text-subtle)]" />
              <h2 className="text-lg font-bold text-[var(--text)]">Страница заблокирована</h2>
            </div>

            <p className="text-body text-[var(--text-secondary)] leading-relaxed mb-7 max-w-xs">
              Подключите WhatsApp клиники, чтобы разблокировать эту страницу и настроить
              каналы привлечения пациентов.
            </p>

            {isOwner ? (
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2.5 h-12 px-6 rounded-xl text-body font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] shadow-md"
                style={{ backgroundColor: "#25d366" }}
              >
                <WhatsAppIcon size={18} color="white" />
                Подключить WhatsApp
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-[#fef3c7] border border-[#d97706]/30 rounded-xl px-4 py-3 text-body text-[var(--warning)]">
                <Lock className="w-4 h-4 shrink-0" />
                <span>Обратитесь к владельцу клиники для подключения WhatsApp</span>
              </div>
            )}
          </div>
        ) : (
          <ChannelsSettings />
        )}

        {waStatusError && (
          <div className="mt-4 bg-[#fef3c7] border border-[#d97706]/30 rounded-xl px-4 py-3 text-body text-[var(--warning)]">
            Не удалось проверить статус WhatsApp. Настройки каналов доступны, но подключение может быть недоступно.
          </div>
        )}
      </div>

      {isOwner && (
        <WhatsAppConnectModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            fetchStatus();
          }}
          onConnected={() => {
            fetchStatus();
          }}
        />
      )}
    </PageShell>
  );
}

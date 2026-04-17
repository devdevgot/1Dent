import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ChevronLeft, Radio, Lock } from "lucide-react";
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
  const [modalOpen, setModalOpen] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await customFetch<{ success: boolean; data: WaStatus }>(
        "/api/clinic/green-api/status",
      );
      setWaStatus(res.data);
    } catch {
      setWaStatus(null);
    } finally {
      setWaLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const isConnected = waStatus?.connected;
  const isBlocked = !waLoading && !isConnected;

  return (
    <div className="min-h-full bg-[#f2f2f7] pb-8">
      <div className="bg-white px-4 pt-5 pb-4 mb-4 flex items-center gap-3 border-b border-gray-100">
        <Link href="/menu" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" strokeWidth={1.8} />
          <h1 className="text-[17px] font-semibold text-gray-900">
            {t("channels.sectionTitle", { defaultValue: "Каналы привлечения" })}
          </h1>
        </div>
      </div>

      <div className="px-4 relative">
        {isBlocked ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg mb-5"
              style={{ backgroundColor: "#25D366" + "20" }}
            >
              <WhatsAppIcon size={46} color="#25D366" />
            </div>

            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-gray-400" />
              <h2 className="text-lg font-bold text-gray-800">Страница заблокирована</h2>
            </div>

            <p className="text-sm text-gray-500 leading-relaxed mb-7 max-w-xs">
              Подключите WhatsApp клиники, чтобы разблокировать эту страницу и настроить
              каналы привлечения пациентов.
            </p>

            {isOwner ? (
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2.5 h-12 px-6 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] shadow-md"
                style={{ backgroundColor: "#25D366" }}
              >
                <WhatsAppIcon size={18} color="white" />
                Подключить WhatsApp
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                <Lock className="w-4 h-4 shrink-0" />
                <span>Обратитесь к владельцу клиники для подключения WhatsApp</span>
              </div>
            )}
          </div>
        ) : (
          <ChannelsSettings />
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
    </div>
  );
}

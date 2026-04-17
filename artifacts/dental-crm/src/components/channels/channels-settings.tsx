import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import {
  useListChannels,
  useCreateChannel,
  useDeleteChannel,
  getListChannelsQueryKey,
  type ClinicChannel,
  type CreateChannelRequest,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/hooks/use-auth";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Copy, Download, Trash2, Plus, Globe, Handshake, Megaphone, MapPin, ChevronDown, LogOut } from "lucide-react";
import { FaInstagram, FaTelegram, FaWhatsapp } from "react-icons/fa";
import { WhatsAppConnectModal, WhatsAppIcon, type WaStatus } from "@/components/whatsapp/whatsapp-connect-modal";
import { customFetch } from "@workspace/api-client-react";

const BRAND = "#98cc1c";

function ChannelIcon({ type, size = 20 }: { type: string; size?: number }) {
  const props = { size, color: BRAND, style: { flexShrink: 0 } };
  switch (type) {
    case "instagram": return <FaInstagram {...props} />;
    case "telegram":  return <FaTelegram {...props} />;
    case "whatsapp":  return <FaWhatsapp {...props} />;
    case "2gis":      return <MapPin size={size} color={BRAND} style={{ flexShrink: 0 }} />;
    case "website":   return <Globe size={size} color={BRAND} style={{ flexShrink: 0 }} />;
    case "referral":  return <Handshake size={size} color={BRAND} style={{ flexShrink: 0 }} />;
    default:          return <Megaphone size={size} color={BRAND} style={{ flexShrink: 0 }} />;
  }
}

function getRefUrl(refCode: string, phone?: string | null): string {
  const base = window.location.origin;
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits) return `${base}/wa/${digits}/ref/${refCode}`;
  }
  return `${base}/ref/${refCode}`;
}

function formatPhone(digits: string): string {
  if (digits.startsWith("7") && digits.length === 11) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  }
  return `+${digits}`;
}

export function ChannelsSettings() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CreateChannelRequest["type"]>("instagram");
  const [customTypeName, setCustomTypeName] = useState("");
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [waStatus, setWaStatus] = useState<WaStatus | null>(null);
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const isOwner = user?.role === "owner";
  const isAdmin = user?.role === "admin";
  const canManage = isOwner || isAdmin;

  const fetchWaStatus = async () => {
    try {
      const res = await customFetch<{ success: boolean; data: WaStatus }>(
        "/api/clinic/green-api/status",
      );
      setWaStatus(res.data);
    } catch {
      setWaStatus(null);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await customFetch("/api/clinic/green-api", { method: "DELETE" });
      toast({ title: "WhatsApp отключён" });
      setWaStatus({ configured: false, connected: false, phone: null });
    } catch {
      toast({ title: "Ошибка при отключении", variant: "destructive" });
    } finally {
      setDisconnecting(false);
      setConfirmDisconnect(false);
    }
  };

  useEffect(() => {
    if (canManage) fetchWaStatus();
  }, [canManage]);

  const savedPhone = waStatus?.phone ?? null;

  const { data: channelsRes } = useListChannels({
    query: { queryKey: getListChannelsQueryKey(), enabled: canManage },
  });
  const channels: ClinicChannel[] = channelsRes?.data?.channels ?? [];

  const createMutation = useCreateChannel({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey() });
        toast({ title: t("channels.createSuccess") });
        setShowAddForm(false);
        setNewName("");
        setNewType("instagram");
        setCustomTypeName("");
      },
      onError: () => {
        toast({ title: t("common.error", { defaultValue: "Ошибка" }), variant: "destructive" });
      },
    },
  });

  const deleteMutation = useDeleteChannel({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey() });
        toast({ title: t("channels.deleteSuccess") });
      },
    },
  });

  const handleCopyLink = (refCode: string) => {
    const url = getRefUrl(refCode, savedPhone);
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: t("channels.linkCopied"), description: url });
    });
  };

  const handleDownloadQr = async (channel: ClinicChannel) => {
    const url = getRefUrl(channel.refCode, savedPhone);
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `qr-${channel.name.replace(/\s+/g, "_")}.png`;
      a.click();
    } catch {
      toast({ title: t("common.error", { defaultValue: "Ошибка генерации QR" }), variant: "destructive" });
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate({ data: { name: newName.trim(), type: newType } });
  };

  if (!canManage) return null;

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="bg-white border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#25D366" + "20" }}
              >
                <WhatsAppIcon size={18} color="#25D366" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800">WhatsApp клиники</p>
                {savedPhone ? (
                  <p className="text-xs text-gray-500 font-mono">{formatPhone(savedPhone)}</p>
                ) : (
                  <p className="text-xs text-gray-400">Не подключён</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {waStatus?.connected && (
                <button
                  onClick={() => setConfirmDisconnect(true)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Отключить
                </button>
              )}
              <button
                onClick={() => setWaModalOpen(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-border text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {waStatus?.connected ? "Изменить" : "Подключить"}
              </button>
            </div>
          </div>

          {confirmDisconnect && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-gray-600 mb-3">
                Отключить WhatsApp? Входящие сообщения перестанут поступать в приложение.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDisconnect(false)}
                  className="flex-1 h-8 rounded-lg border border-border text-xs font-medium hover:bg-gray-50 transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex-1 h-8 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors disabled:opacity-60"
                >
                  {disconnecting ? "Отключение..." : "Да, отключить"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-2">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Каналы сквозной аналитики
        </h2>

        <div className="space-y-4">
          {channels.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("channels.noChannels")}</p>
          ) : (
            <div className="space-y-2">
              {channels.map((ch) => {
                const refUrl = getRefUrl(ch.refCode, savedPhone);
                return (
                  <div key={ch.id} className="flex items-center gap-3 p-3 border border-border/60 rounded-xl bg-white">
                    <ChannelIcon type={ch.type} size={20} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{ch.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{refUrl}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleCopyLink(ch.refCode)}
                        title={t("channels.copyLink")}
                        className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownloadQr(ch)}
                        title={t("channels.downloadQr")}
                        className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(ch.id)}
                        title={t("channels.deleteChannel")}
                        className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showAddForm ? (
            <form onSubmit={handleCreate} className="border border-primary/30 rounded-xl p-4 bg-primary/5 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("channels.channelName")}</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={100}
                  placeholder={t("channels.channelNamePlaceholder")}
                  className="w-full h-9 rounded-lg border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("channels.channelType")}</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowTypeDropdown((v) => !v)}
                    className="w-full h-9 rounded-lg border border-border bg-white px-3 text-sm flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#98cc1c]/30"
                  >
                    <ChannelIcon type={newType} size={16} />
                    <span className="flex-1 text-left text-gray-800">
                      {newType === "other" && customTypeName
                        ? customTypeName
                        : t(`source.${newType}`, { defaultValue: newType })}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showTypeDropdown ? "rotate-180" : ""}`} />
                  </button>

                  {showTypeDropdown && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
                      {(["instagram", "telegram", "2gis", "website", "whatsapp", "other"] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setNewType(type);
                            if (type !== "other") setCustomTypeName("");
                            setShowTypeDropdown(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-gray-50 ${
                            newType === type ? "text-[#4a6b0a] font-medium bg-[#f7fce8]" : "text-gray-800"
                          }`}
                        >
                          <ChannelIcon type={type} size={16} />
                          {t(`source.${type}`, { defaultValue: type })}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {newType === "other" && (
                  <input
                    type="text"
                    value={customTypeName}
                    onChange={(e) => {
                      setCustomTypeName(e.target.value);
                      setNewName(e.target.value);
                    }}
                    placeholder="Например: TikTok, YouTube, Баннер..."
                    autoFocus
                    className="mt-2 w-full h-9 rounded-lg border border-[#98cc1c]/50 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#98cc1c]/30"
                  />
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setNewName(""); setCustomTypeName(""); setNewType("instagram"); setShowTypeDropdown(false); }}
                  className="flex-1 h-9 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  {t("channels.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !newName.trim()}
                  className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {createMutation.isPending ? t("channels.creating") : t("channels.create")}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full h-10 rounded-xl border-2 border-dashed border-border hover:border-primary/50 text-sm text-muted-foreground hover:text-primary flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("channels.addChannel")}
            </button>
          )}
        </div>
      </div>

      <ConfirmDeleteDialog
        open={!!confirmDeleteId}
        onConfirm={() => { deleteMutation.mutate({ id: confirmDeleteId! }); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {isOwner && (
        <WhatsAppConnectModal
          open={waModalOpen}
          onClose={() => {
            setWaModalOpen(false);
            fetchWaStatus();
          }}
          onConnected={() => {
            fetchWaStatus();
          }}
          startAtSetup
        />
      )}
    </div>
  );
}

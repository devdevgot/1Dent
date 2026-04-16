import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import {
  useListChannels,
  useCreateChannel,
  useDeleteChannel,
  useUpdateClinicWhatsappPhone,
  getListChannelsQueryKey,
  type ClinicChannel,
  type CreateChannelRequest,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/hooks/use-auth";
import { Copy, Download, Trash2, Plus, Smartphone } from "lucide-react";

const CHANNEL_TYPE_ICONS: Record<string, string> = {
  instagram: "📸",
  telegram: "✈️",
  "2gis": "📍",
  website: "🌐",
  whatsapp: "💬",
  referral: "🤝",
  other: "📢",
};

function getRefUrl(refCode: string, phone?: string | null): string {
  const base = window.location.origin;
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits) return `${base}/wa/${digits}/ref/${refCode}`;
  }
  return `${base}/ref/${refCode}`;
}

export function ChannelsSettings() {
  const { t } = useTranslation();
  const { user, clinic } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CreateChannelRequest["type"]>("instagram");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState<string | null>(null);

  const isOwner = user?.role === "owner";
  const isAdmin = user?.role === "admin";
  const canManage = isOwner || isAdmin;

  useEffect(() => {
    const phone = (clinic as any)?.whatsappPhone ?? null;
    if (phone) {
      setSavedPhone(phone);
      setWhatsappPhone(phone);
    }
  }, [clinic]);

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

  const updatePhoneMutation = useUpdateClinicWhatsappPhone({
    mutation: {
      onSuccess: () => {
        const digits = whatsappPhone.replace(/\D/g, "");
        setSavedPhone(digits);
        toast({ title: t("channels.whatsappPhoneSaved") });
      },
      onError: () => {
        toast({ title: t("common.error", { defaultValue: "Ошибка" }), variant: "destructive" });
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

  const handleSavePhone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsappPhone.trim()) return;
    updatePhoneMutation.mutate({ data: { whatsappPhone: whatsappPhone.replace(/\D/g, "") } });
  };

  if (!canManage) return null;

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-emerald-800">{t("channels.whatsappPhone")}</h3>
          </div>
          <p className="text-xs text-emerald-700 mb-3">{t("channels.whatsappPhoneDesc")}</p>
          <form onSubmit={handleSavePhone} className="flex gap-2">
            <input
              type="text"
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              placeholder={t("channels.whatsappPhonePlaceholder")}
              className="flex-1 h-9 rounded-lg border border-emerald-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
            />
            <button
              type="submit"
              disabled={updatePhoneMutation.isPending || !whatsappPhone.trim()}
              className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {t("channels.whatsappPhoneSave")}
            </button>
          </form>
        </div>
      )}

      {!savedPhone && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs text-amber-700">
            ⚠️ {t("channels.noPhoneWarning", { defaultValue: "Сначала сохраните номер WhatsApp — тогда ссылки каналов будут вести прямо в чат клиники." })}
          </p>
        </div>
      )}

      {channels.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t("channels.noChannels")}</p>
      ) : (
        <div className="space-y-2">
          {channels.map((ch) => {
            const refUrl = getRefUrl(ch.refCode, savedPhone);
            return (
              <div key={ch.id} className="flex items-center gap-3 p-3 border border-border/60 rounded-xl bg-white">
                <span className="text-xl">{CHANNEL_TYPE_ICONS[ch.type] ?? "📢"}</span>
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
                    onClick={() => {
                      if (confirm(t("channels.deleteConfirm"))) {
                        deleteMutation.mutate({ id: ch.id });
                      }
                    }}
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
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as CreateChannelRequest["type"])}
              className="w-full h-9 rounded-lg border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {(["instagram", "telegram", "2gis", "website", "whatsapp", "referral", "other"] as const).map((type) => (
                <option key={type} value={type}>
                  {CHANNEL_TYPE_ICONS[type]} {t(`source.${type}`, { defaultValue: type })}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setNewName(""); }}
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
  );
}

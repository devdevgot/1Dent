import { useState, useEffect, useRef } from "react";
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
import { Copy, Download, Trash2, Plus, Globe, Handshake, Megaphone, MapPin, ChevronDown, LogOut, RefreshCw, AlertTriangle, Pencil, Check, X } from "lucide-react";
import { FaInstagram, FaTelegram, FaWhatsapp } from "react-icons/fa";
import { WhatsAppConnectModal, WhatsAppIcon, type WaStatus } from "@/components/whatsapp/whatsapp-connect-modal";
import { customFetch } from "@workspace/api-client-react";

const BRAND = "#1f75fe";

const MESSENGER_COLORS: Record<string, string> = {
  whatsapp: "#25d366",
  telegram: "#2481cc",
  instagram: "#e91e8c",
};

function getChannelColor(type: string): string {
  return MESSENGER_COLORS[type] ?? BRAND;
}

function ChannelIcon({ type, size = 20 }: { type: string; size?: number }) {
  const color = getChannelColor(type);
  const props = { size, color, style: { flexShrink: 0 } };
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
  const [waForceSetup, setWaForceSetup] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [recheckingWebhook, setRecheckingWebhook] = useState(false);
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [disconnectProgress, setDisconnectProgress] = useState(0);
  const [disconnectStage, setDisconnectStage] = useState("");
  const disconnectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const handleRecheckWebhook = async () => {
    setRecheckingWebhook(true);
    try {
      const res = await customFetch<{ success: boolean; data?: { webhookUrl: string } }>(
        "/api/clinic/green-api/register-webhook",
        { method: "POST" },
      );
      toast({
        title: "Вебхук зарегистрирован",
        description: `Green API настроена на адрес: ${res.data?.webhookUrl ?? ""}`,
      });
      await fetchWaStatus();
    } catch {
      toast({ title: "Ошибка регистрации вебхука", variant: "destructive" });
    } finally {
      setRecheckingWebhook(false);
    }
  };

  const handlePhoneSave = async () => {
    const digits = phoneInput.replace(/\D/g, "");
    if (!digits || digits.length < 7 || digits.length > 15) {
      toast({ title: "Введите корректный номер", variant: "destructive" });
      return;
    }
    setPhoneSaving(true);
    try {
      await customFetch("/api/clinic/whatsapp-phone", {
        method: "PATCH",
        body: JSON.stringify({ phone: digits }),
        headers: { "Content-Type": "application/json" },
      });
      toast({ title: "Номер сохранён" });
      setPhoneEditing(false);
      setPhoneInput("");
      await fetchWaStatus();
    } catch {
      toast({ title: "Ошибка сохранения номера", variant: "destructive" });
    } finally {
      setPhoneSaving(false);
    }
  };

  const DISCONNECT_STAGES = [
    { threshold: 0,  label: "Отправляем запрос на отключение..." },
    { threshold: 20, label: "Выходим из Green API..." },
    { threshold: 55, label: "Удаляем устройство с телефона..." },
    { threshold: 80, label: "Завершение..." },
  ];

  const handleDisconnect = async () => {
    setConfirmDisconnect(false);
    setDisconnecting(true);
    setDisconnectProgress(0);
    setDisconnectStage(DISCONNECT_STAGES[0].label);

    const startMs = Date.now();
    const TOTAL_MS = 14_000;
    disconnectTimerRef.current = setInterval(() => {
      const pct = Math.min(85, Math.floor(((Date.now() - startMs) / TOTAL_MS) * 85));
      setDisconnectProgress(pct);
      const stage = [...DISCONNECT_STAGES].reverse().find(s => pct >= s.threshold);
      setDisconnectStage(stage?.label ?? "");
    }, 150);

    try {
      const res = await customFetch<{ success: boolean; data: { greenApiLogoutOk: boolean; message: string } }>(
        "/api/clinic/green-api", { method: "DELETE" }
      );
      const ok = res.data?.greenApiLogoutOk ?? false;
      setDisconnectProgress(100);
      setDisconnectStage(ok ? "Устройство отключено!" : "Данные удалены из CRM");
      await new Promise(r => setTimeout(r, 700));
      setWaStatus({ configured: false, connected: false, phone: null });
      toast({
        title: ok ? "WhatsApp отключён" : "Отключено из CRM",
        description: res.data?.message,
        variant: ok ? "default" : "destructive",
        duration: ok ? 4000 : 8000,
      });
    } catch {
      setDisconnectProgress(100);
      setDisconnectStage("Ошибка");
      await new Promise(r => setTimeout(r, 500));
      toast({ title: "Ошибка при отключении", variant: "destructive" });
    } finally {
      if (disconnectTimerRef.current) clearInterval(disconnectTimerRef.current);
      setDisconnecting(false);
      setDisconnectProgress(0);
      setDisconnectStage("");
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
      {/* ─── Disconnecting progress overlay ─────────────────────────────────── */}
      {disconnecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-80 flex flex-col items-center gap-5 mx-4">
            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#25d366" + "18" }}>
              <WhatsAppIcon size={36} color="#25d366" />
            </div>
            {/* Title + stage */}
            <div className="text-center">
              <p className="text-base font-bold text-[#0f172a] mb-1">Отключение WhatsApp</p>
              <p className="text-xs text-[#94a3b8] min-h-[16px]">{disconnectStage}</p>
            </div>
            {/* Big percentage */}
            <div
              className="text-5xl font-bold tabular-nums transition-all duration-200"
              style={{ color: disconnectProgress === 100 ? "#16a34a" : "#dc2626" }}
            >
              {disconnectProgress}%
            </div>
            {/* Progress bar */}
            <div className="w-full h-2.5 bg-[#f1ede4] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-200 ease-linear"
                style={{
                  width: `${disconnectProgress}%`,
                  backgroundColor: disconnectProgress === 100 ? "#16a34a" : "#dc2626",
                }}
              />
            </div>
            <p className="text-xs text-[#94a3b8] text-center leading-relaxed">
              Пожалуйста, не закрывайте страницу.<br />Устройство отвязывается от WhatsApp...
            </p>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="bg-white border border-[#e8e3d9] rounded-xl p-4">
          <div className="flex flex-col gap-3">
            {/* Top: icon + label + phone */}
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#25d366" + "20" }}
              >
                <WhatsAppIcon size={18} color="#25d366" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0f172a]">WhatsApp клиники</p>
                {savedPhone ? (
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-[#64748b] font-mono">{formatPhone(savedPhone)}</p>
                    {isOwner && !phoneEditing && (
                      <button
                        onClick={() => { setPhoneEditing(true); setPhoneInput(savedPhone); }}
                        title="Исправить номер вручную"
                        className="text-[#94a3b8] hover:text-[#64748b] transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[#94a3b8]">Не подключён</p>
                )}
              </div>
            </div>
            {/* Bottom: action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {waStatus?.connected && (
                <button
                  onClick={handleRecheckWebhook}
                  disabled={recheckingWebhook}
                  title="Принудительно перерегистрировать вебхук в Green API"
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-[#e8e3d9] text-[#64748b] hover:bg-[#faf8f4] transition-colors disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${recheckingWebhook ? "animate-spin" : ""}`} />
                  Проверить
                </button>
              )}
              {waStatus?.connected && (
                <button
                  onClick={() => setConfirmDisconnect(true)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-[#dc2626]/30 text-[#dc2626] hover:bg-[#fef2f2] transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Отключить
                </button>
              )}
              <button
                onClick={() => {
                  setWaForceSetup(!!waStatus?.connected);
                  setWaModalOpen(true);
                }}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border border-[#e8e3d9] text-[#64748b] hover:bg-[#faf8f4] transition-colors"
              >
                {waStatus?.connected ? "Изменить" : "Подключить"}
              </button>
            </div>
          </div>

          {phoneEditing && (
            <div className="mt-3 pt-3 border-t border-[#e8e3d9]">
              <p className="text-xs text-[#64748b] mb-2">
                Введите правильный номер WhatsApp (в международном формате, например <span className="font-mono">77071234567</span>):
              </p>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  placeholder="77071234567"
                  className="flex-1 h-8 px-3 rounded-lg border border-[#e8e3d9] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/50"
                  onKeyDown={e => { if (e.key === "Enter") handlePhoneSave(); if (e.key === "Escape") setPhoneEditing(false); }}
                  autoFocus
                />
                <button
                  onClick={() => { setPhoneEditing(false); setPhoneInput(""); }}
                  className="w-8 h-8 rounded-lg border border-[#e8e3d9] flex items-center justify-center text-[#94a3b8] hover:bg-[#faf8f4] transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handlePhoneSave}
                  disabled={phoneSaving}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white disabled:opacity-60 transition-colors"
                  style={{ backgroundColor: BRAND }}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {confirmDisconnect && (
            <div className="mt-3 pt-3 border-t border-[#e8e3d9]">
              <p className="text-xs text-[#64748b] mb-3">
                Отключить WhatsApp? Входящие сообщения перестанут поступать в приложение.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDisconnect(false)}
                  className="flex-1 h-8 rounded-lg border border-[#e8e3d9] text-xs font-medium hover:bg-[#faf8f4] transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="flex-1 h-8 rounded-lg bg-[#dc2626] text-white text-xs font-semibold hover:bg-[#b91c1c] transition-colors disabled:opacity-60"
                >
                  {disconnecting ? "Отключение..." : "Да, отключить"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-2">
        <h2 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">
          Каналы сквозной аналитики
        </h2>

        {/* Warning: WhatsApp not connected — ref links won't redirect to WhatsApp */}
        {channels.length > 0 && waStatus !== null && !waStatus?.connected && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-[#fef3c7] border border-[#d97706]/30 mb-3">
            <AlertTriangle className="w-4 h-4 text-[#d97706] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#d97706]">WhatsApp не подключён</p>
              <p className="text-xs text-[#d97706] mt-0.5 leading-relaxed">
                Реферальные ссылки не будут открывать WhatsApp. Подключите WhatsApp клиники выше, чтобы ссылки работали корректно.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {channels.length === 0 ? (
            <p className="text-sm text-[#64748b] text-center py-6">{t("channels.noChannels")}</p>
          ) : (
            <div className="space-y-2">
              {channels.map((ch) => {
                const refUrl = getRefUrl(ch.refCode, savedPhone);
                return (
                  <div key={ch.id} className="flex items-center gap-3 p-3 border border-[#e8e3d9] rounded-xl bg-white">
                    <ChannelIcon type={ch.type} size={20} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#0f172a] truncate">{ch.name}</p>
                      <p className="text-xs text-[#64748b] font-mono truncate">{refUrl}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleCopyLink(ch.refCode)}
                        title={t("channels.copyLink")}
                        className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[#f1ede4] transition-colors text-[#64748b] hover:text-[#0f172a]"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownloadQr(ch)}
                        title={t("channels.downloadQr")}
                        className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[#f1ede4] transition-colors text-[#64748b] hover:text-[#0f172a]"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(ch.id)}
                        title={t("channels.deleteChannel")}
                        className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[#fef2f2] transition-colors text-[#64748b] hover:text-[#dc2626]"
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
            <form onSubmit={handleCreate} className="border border-[#1f75fe]/30 rounded-xl p-4 bg-[#1f75fe]/10 space-y-3">
              <div>
                <label className="text-xs font-medium text-[#64748b] mb-1 block">{t("channels.channelName")}</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={100}
                  placeholder={t("channels.channelNamePlaceholder")}
                  className="w-full h-9 rounded-lg border border-[#e8e3d9] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#64748b] mb-1 block">{t("channels.channelType")}</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowTypeDropdown((v) => !v)}
                    className="w-full h-9 rounded-lg border border-[#e8e3d9] bg-white px-3 text-sm flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/30"
                  >
                    <ChannelIcon type={newType} size={16} />
                    <span className="flex-1 text-left text-[#0f172a]">
                      {newType === "other" && customTypeName
                        ? customTypeName
                        : t(`source.${newType}`, { defaultValue: newType })}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-[#94a3b8] transition-transform ${showTypeDropdown ? "rotate-180" : ""}`} />
                  </button>

                  {showTypeDropdown && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#e8e3d9] rounded-xl shadow-lg overflow-hidden">
                      {(["instagram", "telegram", "2gis", "website", "whatsapp", "other"] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setNewType(type);
                            if (type !== "other") setCustomTypeName("");
                            setShowTypeDropdown(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-[#faf8f4] ${
                            newType === type ? "text-[#1f75fe] font-medium bg-[#1f75fe]/10" : "text-[#0f172a]"
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
                    className="mt-2 w-full h-9 rounded-lg border border-[#1f75fe]/50 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1f75fe]/30"
                  />
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setNewName(""); setCustomTypeName(""); setNewType("instagram"); setShowTypeDropdown(false); }}
                  className="flex-1 h-9 rounded-lg border border-[#e8e3d9] text-sm font-medium hover:bg-[#f1ede4] transition-colors"
                >
                  {t("channels.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !newName.trim()}
                  className="flex-1 h-9 rounded-lg bg-[#1f75fe] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {createMutation.isPending ? t("channels.creating") : t("channels.create")}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full h-10 rounded-xl border-2 border-dashed border-[#e8e3d9] hover:border-[#1f75fe]/50 text-sm text-[#64748b] hover:text-[#1f75fe] flex items-center justify-center gap-2 transition-colors"
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
          forceSetup={waForceSetup}
          onClose={() => {
            setWaModalOpen(false);
            setWaForceSetup(false);
            fetchWaStatus();
          }}
          onConnected={() => {
            setWaForceSetup(false);
            fetchWaStatus();
          }}
          startAtSetup
        />
      )}
    </div>
  );
}

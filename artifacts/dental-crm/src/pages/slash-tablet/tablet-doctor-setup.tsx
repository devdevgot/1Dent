import { useCallback, useState } from "react";
import { TabletSmartphone, Smartphone, KeyRound } from "lucide-react";
import { TabletPinSetupModal } from "@/components/tablet/tablet-pin-setup-modal";
import { setTabletPin } from "@/lib/tablet-api";
import { useToast } from "@/hooks/use-toast";
import { InstallAppButton } from "@/components/pwa/install-app";

export function TabletDoctorSetup() {
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinSaving, setPinSaving] = useState(false);
  const { toast } = useToast();

  const savePin = useCallback(async (pin: string) => {
    setPinSaving(true);
    try {
      await setTabletPin(pin);
      setPinModalOpen(false);
      toast({ title: "PIN сохранён", description: "Можно входить на планшет по PIN без QR" });
    } catch (err) {
      toast({
        title: "Ошибка",
        description: err instanceof Error ? err.message : "Не удалось сохранить PIN",
        variant: "destructive",
      });
    } finally {
      setPinSaving(false);
    }
  }, [toast]);

  return (
    <div className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#faf8f4] px-6 font-manrope">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-[#1f75fe]/8 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-[#7c3aed]/8 blur-3xl" />
      </div>

      <div className="relative flex w-full max-w-lg flex-col items-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#1f75fe]/10">
          <TabletSmartphone className="h-10 w-10 text-[#1f75fe]" />
        </div>
        <h1 className="text-2xl font-extrabold text-[#0f172a]">SlashTablet</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#64748b]">
          Откройте <strong className="text-[#0f172a]">/tablet</strong> на планшете в кабинете.
          На экране появится QR-код — отсканируйте его с телефона через сканер в CRM.
          При первом подключении владелец клиники подтверждает привязку кнопкой на телефоне.
        </p>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#e8e3d9] bg-white p-4 text-left text-sm text-[#64748b]">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-[#1f75fe]" />
          <p>
            После подключения владельцем сотрудники смогут входить по QR-коду.
            Если не хотите сканировать — настройте 4-значный PIN в CRM и входите по нему на планшете.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setPinModalOpen(true)}
          className="mt-6 flex items-center gap-2 rounded-2xl border border-[#e8e3d9] bg-white px-6 py-3 text-sm font-semibold text-[#0f172a] transition-colors hover:bg-[#faf8f4]"
        >
          <KeyRound className="h-4 w-4 text-[#1f75fe]" />
          Настроить PIN для входа без QR
        </button>

        <InstallAppButton className="mt-3" />
      </div>

      <TabletPinSetupModal
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSubmit={(pin) => void savePin(pin)}
        loading={pinSaving}
      />
    </div>
  );
}

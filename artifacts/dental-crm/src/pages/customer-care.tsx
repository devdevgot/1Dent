import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HeartHandshake, Loader2, Save, Info } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Switch } from "@/components/ui/switch";
import { customFetch } from "@workspace/api-client-react";
import { usePageBack } from "@/hooks/use-page-back";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-error-message";
import { cn } from "@/lib/utils";

type CarePrompts = {
  leadNurtureTemplates: [string, string, string];
  leadNurturePrompts: [string, string, string];
  reminder24hTemplate: string;
  reminder24hPrompt: string;
  reminder1hTemplate: string;
  reminder1hPrompt: string;
  noShowTemplate: string;
  noShowPrompt: string;
  postVisitTemplates: [string, string];
  postVisitPrompts: [string, string];
  upsellTemplate: string;
  upsellPrompt: string;
  handoffToBookingPrompt: string;
};

type CareSettings = {
  enabled: boolean;
  leadNurtureEnabled: boolean;
  leadNurtureDelaysMinutes: [number, number, number];
  reminder1hEnabled: boolean;
  reminder24hEnabled: boolean;
  noShowEnabled: boolean;
  noShowGraceHours: number;
  postVisitEnabled: boolean;
  upsellEnabled: boolean;
  bookingMode: "handoff_to_booking";
  prompts: CarePrompts;
};

type ScenarioKey =
  | "lead1"
  | "lead2"
  | "lead3"
  | "rem24"
  | "rem1"
  | "noshow"
  | "post1"
  | "post2"
  | "upsell"
  | "handoff";

const SCENARIOS: {
  key: ScenarioKey;
  title: string;
  hint: string;
  enableKey?: keyof CareSettings;
}[] = [
  {
    key: "lead1",
    title: "Дожим · касание 1",
    hint: "Через ~25 минут, если не записался",
    enableKey: "leadNurtureEnabled",
  },
  {
    key: "lead2",
    title: "Дожим · касание 2",
    hint: "Через ~2.5 часа",
    enableKey: "leadNurtureEnabled",
  },
  {
    key: "lead3",
    title: "Дожим · касание 3",
    hint: "На следующий день",
    enableKey: "leadNurtureEnabled",
  },
  {
    key: "rem24",
    title: "Напоминание за сутки",
    hint: "Перед визитом",
    enableKey: "reminder24hEnabled",
  },
  {
    key: "rem1",
    title: "Напоминание за 1 час",
    hint: "В день визита",
    enableKey: "reminder1hEnabled",
  },
  {
    key: "noshow",
    title: "Не пришёл (no-show)",
    hint: "После пропущенного визита",
    enableKey: "noShowEnabled",
  },
  {
    key: "post1",
    title: "Забота после приёма · 1",
    hint: "Через 2–4 часа",
    enableKey: "postVisitEnabled",
  },
  {
    key: "post2",
    title: "Забота после приёма · 2",
    hint: "На следующий день",
    enableKey: "postVisitEnabled",
  },
  {
    key: "upsell",
    title: "Повторная продажа",
    hint: "Приглашение прийти снова",
    enableKey: "upsellEnabled",
  },
  {
    key: "handoff",
    title: "Передача в бот записи",
    hint: "Когда пациент согласился записаться",
  },
];

function getTemplate(settings: CareSettings, key: ScenarioKey): string {
  const p = settings.prompts;
  switch (key) {
    case "lead1":
      return p.leadNurtureTemplates[0];
    case "lead2":
      return p.leadNurtureTemplates[1];
    case "lead3":
      return p.leadNurtureTemplates[2];
    case "rem24":
      return p.reminder24hTemplate;
    case "rem1":
      return p.reminder1hTemplate;
    case "noshow":
      return p.noShowTemplate;
    case "post1":
      return p.postVisitTemplates[0];
    case "post2":
      return p.postVisitTemplates[1];
    case "upsell":
      return p.upsellTemplate;
    case "handoff":
      return "Отлично 😊 Сейчас подберём удобное время и оформим запись.";
  }
}

function getPrompt(settings: CareSettings, key: ScenarioKey): string {
  const p = settings.prompts;
  switch (key) {
    case "lead1":
      return p.leadNurturePrompts[0];
    case "lead2":
      return p.leadNurturePrompts[1];
    case "lead3":
      return p.leadNurturePrompts[2];
    case "rem24":
      return p.reminder24hPrompt;
    case "rem1":
      return p.reminder1hPrompt;
    case "noshow":
      return p.noShowPrompt;
    case "post1":
      return p.postVisitPrompts[0];
    case "post2":
      return p.postVisitPrompts[1];
    case "upsell":
      return p.upsellPrompt;
    case "handoff":
      return p.handoffToBookingPrompt;
  }
}

function setTemplate(settings: CareSettings, key: ScenarioKey, value: string): CareSettings {
  const p = { ...settings.prompts };
  const next = { ...settings, prompts: p };
  switch (key) {
    case "lead1":
      p.leadNurtureTemplates = [value, p.leadNurtureTemplates[1], p.leadNurtureTemplates[2]];
      break;
    case "lead2":
      p.leadNurtureTemplates = [p.leadNurtureTemplates[0], value, p.leadNurtureTemplates[2]];
      break;
    case "lead3":
      p.leadNurtureTemplates = [p.leadNurtureTemplates[0], p.leadNurtureTemplates[1], value];
      break;
    case "rem24":
      p.reminder24hTemplate = value;
      break;
    case "rem1":
      p.reminder1hTemplate = value;
      break;
    case "noshow":
      p.noShowTemplate = value;
      break;
    case "post1":
      p.postVisitTemplates = [value, p.postVisitTemplates[1]];
      break;
    case "post2":
      p.postVisitTemplates = [p.postVisitTemplates[0], value];
      break;
    case "upsell":
      p.upsellTemplate = value;
      break;
    case "handoff":
      break;
  }
  return next;
}

function setPrompt(settings: CareSettings, key: ScenarioKey, value: string): CareSettings {
  const p = { ...settings.prompts };
  const next = { ...settings, prompts: p };
  switch (key) {
    case "lead1":
      p.leadNurturePrompts = [value, p.leadNurturePrompts[1], p.leadNurturePrompts[2]];
      break;
    case "lead2":
      p.leadNurturePrompts = [p.leadNurturePrompts[0], value, p.leadNurturePrompts[2]];
      break;
    case "lead3":
      p.leadNurturePrompts = [p.leadNurturePrompts[0], p.leadNurturePrompts[1], value];
      break;
    case "rem24":
      p.reminder24hPrompt = value;
      break;
    case "rem1":
      p.reminder1hPrompt = value;
      break;
    case "noshow":
      p.noShowPrompt = value;
      break;
    case "post1":
      p.postVisitPrompts = [value, p.postVisitPrompts[1]];
      break;
    case "post2":
      p.postVisitPrompts = [p.postVisitPrompts[0], value];
      break;
    case "upsell":
      p.upsellPrompt = value;
      break;
    case "handoff":
      p.handoffToBookingPrompt = value;
      break;
  }
  return next;
}

export default function CustomerCarePage() {
  const goBack = usePageBack();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<CareSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState<ScenarioKey>("lead1");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customFetch<{ success: boolean; data: CareSettings }>("/api/customer-care/settings");
      setSettings(res.data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Не удалось загрузить настройки службы заботы"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await customFetch<{ success: boolean; data: CareSettings }>("/api/customer-care/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings(res.data);
      toast.success("Сохранено");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Не удалось сохранить"));
    } finally {
      setSaving(false);
    }
  };

  const scenario = SCENARIOS.find((s) => s.key === active)!;

  return (
    <PageShell className="pb-10">
      <PageHeader
        title={t("nav.customerCare", { defaultValue: "Служба заботы" })}
        onBack={goBack}
        actions={
          <button
            type="button"
            onClick={() => void save()}
            disabled={!settings || saving}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-[#1f75fe] text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Сохранить
          </button>
        }
      />

      <div className="px-4 pt-4 space-y-4">
        <div className="rounded-2xl border border-[#e8e3d9] bg-white p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#fef3c7] flex items-center justify-center shrink-0">
            <HeartHandshake className="w-5 h-5 text-[#d97706]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#0f172a]">Customer Care Chatbot</p>
                <p className="text-xs text-[#64748b] mt-0.5">
                  Тот же WhatsApp, что и бот записи. Дожим, напоминания, забота, upsell.
                </p>
              </div>
              {settings && (
                <div className="flex flex-col items-end gap-1">
                  <Switch checked={settings.enabled} disabled aria-readonly />
                  <span className="text-[10px] text-[#94a3b8] whitespace-nowrap">
                    {settings.enabled ? "Включён с чатботом" : "Выключен с чатботом"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-3.5 flex gap-2.5">
          <Info className="w-4 h-4 text-[#1f75fe] shrink-0 mt-0.5" />
          <p className="text-xs text-[#1e3a5f] leading-relaxed">
            Служба заботы <strong>всегда включается вместе с основным чатботом</strong> и выключается
            вместе с ним — отдельный выключатель не нужен. Когда пациент согласится записаться,{" "}
            <strong>основной чатбот записи</strong> подберёт врача, слоты и создаст визит. Care сам
            запись не оформляет.
          </p>
        </div>

        {loading || !settings ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-[#94a3b8]" />
          </div>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {SCENARIOS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setActive(s.key)}
                  className={cn(
                    "shrink-0 h-9 px-3 rounded-full text-xs font-medium border transition-colors",
                    active === s.key
                      ? "bg-[#0f172a] text-white border-[#0f172a]"
                      : "bg-white text-[#475569] border-[#e8e3d9]",
                  )}
                >
                  {s.title}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-[#e8e3d9] bg-white p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[#0f172a]">{scenario.title}</h2>
                  <p className="text-xs text-[#64748b] mt-1">{scenario.hint}</p>
                </div>
                {scenario.enableKey && (
                  <Switch
                    checked={Boolean(settings[scenario.enableKey])}
                    onCheckedChange={(v) =>
                      setSettings({ ...settings, [scenario.enableKey!]: v })
                    }
                  />
                )}
              </div>

              {active !== "handoff" && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#475569]">
                    Текст WhatsApp (шаблон)
                  </span>
                  <textarea
                    value={getTemplate(settings, active)}
                    onChange={(e) => setSettings(setTemplate(settings, active, e.target.value))}
                    rows={5}
                    className="w-full rounded-xl border border-[#e8e3d9] bg-[#fafaf8] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#1f75fe]"
                  />
                  <span className="text-[11px] text-[#94a3b8]">
                    Переменные: {"{{clinic_name}}"}, {"{{patient_name}}"}, {"{{time}}"}, {"{{date}}"},{" "}
                    {"{{doctor_name}}"}
                  </span>
                </label>
              )}

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#475569]">AI-промпт для этого сообщения</span>
                <textarea
                  value={getPrompt(settings, active)}
                  onChange={(e) => setSettings(setPrompt(settings, active, e.target.value))}
                  rows={8}
                  className="w-full rounded-xl border border-[#e8e3d9] bg-[#fafaf8] px-3 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#1f75fe] font-mono"
                />
              </label>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
}

import type { ChatbotSettingsUpdate } from "@workspace/api-client-react";

const DAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

type ExtendedSettings = ChatbotSettingsUpdate & {
  calendarConfig?: {
    slotDurationMinutes?: number;
    bufferMinutes?: number;
    defaultAppointmentMinutes?: number;
  };
  abTestEnabled?: boolean;
  scriptVariants?: Array<{ id: string; name: string; weight: number; greetingTemplate?: string }>;
};

interface Props {
  localSettings: ExtendedSettings;
  serverCalendarConfig?: ExtendedSettings["calendarConfig"];
  onChange: (patch: ExtendedSettings) => void;
}

export function ChatbotCalendarAbSettings({ localSettings, serverCalendarConfig, onChange }: Props) {
  const calendar = { ...(serverCalendarConfig ?? {}), ...(localSettings.calendarConfig ?? {}) };
  const abEnabled = localSettings.abTestEnabled ?? false;
  const variants = localSettings.scriptVariants ?? [];

  const patchCalendar = (field: string, value: number) => {
    onChange({
      calendarConfig: { ...calendar, [field]: value },
    });
  };

  const toggleAb = () => {
    const next = !abEnabled;
    const patch: ExtendedSettings = { abTestEnabled: next };
    if (next && variants.length === 0) {
      patch.scriptVariants = [
        {
          id: "variant-b",
          name: "Вариант B (короткий скрипт)",
          weight: 50,
          greetingTemplate: localSettings.greetingTemplate,
        },
      ];
    }
    onChange(patch);
  };

  const updateVariantWeight = (id: string, weight: number) => {
    onChange({
      scriptVariants: variants.map((v) => (v.id === id ? { ...v, weight } : v)),
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4 space-y-4">
        <div>
          <h3 className="text-body font-semibold text-[var(--text)]">Календарь записи</h3>
          <p className="text-caption text-[var(--text-secondary)] mt-0.5">
            Реальные слоты из расписания процедур — бот предлагает только свободное время
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="text-caption text-[var(--text-secondary)]">Шаг слота (мин)</span>
            <input
              type="number"
              min={15}
              max={120}
              step={15}
              value={calendar.slotDurationMinutes ?? 30}
              onChange={(e) => patchCalendar("slotDurationMinutes", Number(e.target.value))}
              className="w-full rounded-xl border border-[var(--ds-border)] px-2 py-1.5 text-body focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="space-y-1">
            <span className="text-caption text-[var(--text-secondary)]">Длительность приёма (мин)</span>
            <input
              type="number"
              min={15}
              max={180}
              step={15}
              value={calendar.defaultAppointmentMinutes ?? 60}
              onChange={(e) => patchCalendar("defaultAppointmentMinutes", Number(e.target.value))}
              className="w-full rounded-xl border border-[var(--ds-border)] px-2 py-1.5 text-body focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="space-y-1">
            <span className="text-caption text-[var(--text-secondary)]">Буфер между приёмами (мин)</span>
            <input
              type="number"
              min={0}
              max={60}
              step={5}
              value={calendar.bufferMinutes ?? 0}
              onChange={(e) => patchCalendar("bufferMinutes", Number(e.target.value))}
              className="w-full rounded-xl border border-[var(--ds-border)] px-2 py-1.5 text-body focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>
        <p className="text-[11px] text-[var(--text-secondary)]">
          Рабочие часы по умолчанию: {DAY_LABELS.slice(1).join(", ")} 09:00–18:00, {DAY_LABELS[0]} — выходной
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-body font-semibold text-[var(--text)]">A/B тест скриптов</h3>
            <p className="text-caption text-[var(--text-secondary)] mt-0.5">
              Новые пациенты случайно получают вариант A (основной) или B — метрики в разделе «Аналитика»
            </p>
          </div>
          <button
            type="button"
            onClick={toggleAb}
            className={`text-caption font-medium px-3 py-1.5 rounded-full border transition-colors ${
              abEnabled
                ? "bg-[#1f75fe] text-white border-[#1f75fe]"
                : "bg-[var(--surface-2)] text-[var(--text-secondary)] border-[var(--ds-border)]"
            }`}
          >
            {abEnabled ? "Включён" : "Выключен"}
          </button>
        </div>

        {abEnabled && (
          <div className="space-y-2 pt-2 border-t border-[var(--ds-border)]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--text)]">Вариант A — основной скрипт</span>
              <span className="text-[var(--text-secondary)]">{100 - (variants[0]?.weight ?? 50)}%</span>
            </div>
            {variants.map((v) => (
              <div key={v.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[var(--text)]">{v.name}</span>
                  <span className="text-[var(--text-secondary)]">{v.weight}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={v.weight}
                  onChange={(e) => updateVariantWeight(v.id, Number(e.target.value))}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

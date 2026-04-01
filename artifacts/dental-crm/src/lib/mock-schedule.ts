import type { Procedure } from "@workspace/api-client-react";

function toStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mk(date: Date, h: number, min: number, name: string, doctorId = "mock"): Procedure {
  const at = new Date(date);
  at.setHours(h, min, 0, 0);
  return {
    id: `mock-${doctorId}-${toStr(date)}-${h}${min}`,
    patientId: "mock",
    doctorId,
    name,
    scheduledAt: at.toISOString(),
    status: "scheduled",
  } as unknown as Procedure;
}

export function buildMockSchedule(doctorId = "mock"): Procedure[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d1 = new Date(today);
  const d2 = new Date(today); d2.setDate(today.getDate() + 1);
  const d3 = new Date(today); d3.setDate(today.getDate() + 2);

  return [
    mk(d1,  9,  0, "Ахметов Д. — Чистка",           doctorId),
    mk(d1, 11,  0, "Иванова С. — Пломба",             doctorId),
    mk(d1, 14,  0, "Сейтов К. — Консультация",        doctorId),
    mk(d2, 10,  0, "Нурмагамбет А. — Брекеты",        doctorId),
    mk(d2, 12, 30, "Ли Ю. — Отбеливание",              doctorId),
    mk(d3,  9,  0, "Попова М. — Удаление",             doctorId),
    mk(d3, 15,  0, "Смирнов Т. — Пломба",              doctorId),
  ];
}

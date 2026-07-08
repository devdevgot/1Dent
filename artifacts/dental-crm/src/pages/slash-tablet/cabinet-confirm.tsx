import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, MapPin, ChevronRight, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { CABINET, DOCTORS, initials, type TabletDoctor } from "./mock-data";

export function CabinetConfirm({ onConfirm }: { onConfirm: (doctor: TabletDoctor) => void }) {
  const [selected, setSelected] = useState<TabletDoctor>(DOCTORS[0]!);

  return (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-[var(--bg)] px-6 font-manrope">
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-3xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-8 shadow-sm"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f0fdf4]">
            <CheckCircle2 className="h-9 w-9 text-[var(--success)]" />
          </div>
          <h1 className="text-2xl font-extrabold text-[var(--text)]">Вход выполнен</h1>
          <p className="mt-1 text-body text-[var(--text-secondary)]">Подтвердите кабинет и врача</p>
        </div>

        {/* Кабинет */}
        <div className="mb-6 rounded-2xl bg-[var(--bg)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-bold text-[var(--text)]">{CABINET.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-body text-[var(--text-secondary)]">
                <MapPin className="h-3.5 w-3.5" /> {CABINET.clinicName}
              </p>
            </div>
            <span className="rounded-full bg-[#1f75fe]/10 px-3 py-1 text-caption font-bold text-[var(--ds-primary)]">
              Активен
            </span>
          </div>
          <p className="mt-2 text-caption text-[var(--text-subtle)]">{CABINET.address}</p>
        </div>

        {/* Выбор врача */}
        <p className="mb-3 text-caption font-bold uppercase tracking-wide text-[var(--text-subtle)]">Врач на приёме</p>
        <div className="space-y-2">
          {DOCTORS.map((doc) => {
            const active = selected.id === doc.id;
            return (
              <button
                key={doc.id}
                onClick={() => setSelected(doc)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all active:scale-[0.99]",
                  active ? "border-[#1f75fe] bg-[#1f75fe]/5" : "border-[var(--ds-border)] bg-[var(--ds-surface)] hover:bg-[var(--bg)]",
                )}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-body font-bold text-white"
                  style={{ backgroundColor: doc.avatarColor }}
                >
                  {initials(doc.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-[var(--text)]">{doc.name}</p>
                  <p className="flex items-center gap-1 text-caption text-[var(--text-secondary)]">
                    <Stethoscope className="h-3 w-3" /> {doc.specialty}
                  </p>
                </div>
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border-2",
                    active ? "border-[#1f75fe] bg-[#1f75fe]" : "border-[#d4cfc6]",
                  )}
                >
                  {active && <span className="h-2 w-2 rounded-full bg-[var(--ds-surface)]" />}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onConfirm(selected)}
          className="mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1f75fe] py-4 text-base font-bold text-white transition-colors hover:bg-[var(--primary-hover)] active:scale-[0.99]"
        >
          Продолжить <ChevronRight className="h-5 w-5" />
        </button>
      </motion.div>
    </div>
  );
}

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, LayoutGrid } from "lucide-react";
import { LockScreen } from "./lock-screen";
import { CabinetConfirm } from "./cabinet-confirm";
import { PatientList } from "./patient-list";
import { PatientCard } from "./patient-card";
import { CABINET, initials, type TabletDoctor } from "./mock-data";
import { OneDentLogo } from "./onedent-logo";

type Step = "lock" | "confirm" | "patients" | "card";

export default function SlashTabletPage() {
  const [step, setStep] = useState<Step>("lock");
  const [doctor, setDoctor] = useState<TabletDoctor | null>(null);
  const [patientId, setPatientId] = useState<string | null>(null);

  const logout = () => {
    setStep("lock");
    setDoctor(null);
    setPatientId(null);
  };

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[#faf8f4] font-manrope">
      <AnimatePresence mode="wait">
        {step === "lock" && (
          <motion.div key="lock" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LockScreen onUnlock={() => setStep("confirm")} />
          </motion.div>
        )}

        {step === "confirm" && (
          <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CabinetConfirm
              onConfirm={(doc) => { setDoctor(doc); setStep("patients"); }}
            />
          </motion.div>
        )}

        {step === "patients" && doctor && (
          <motion.div
            key="patients"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex h-[100dvh] flex-col"
          >
            <TabletTopBar doctor={doctor} onLogout={logout} />
            <div className="flex-1 overflow-auto">
              <PatientList onSelect={(id) => { setPatientId(id); setStep("card"); }} />
            </div>
          </motion.div>
        )}

        {step === "card" && patientId && (
          <motion.div key="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <PatientCard patientId={patientId} onBack={() => setStep("patients")} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TabletTopBar({ doctor, onLogout }: { doctor: TabletDoctor; onLogout: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-[#e8e3d9] bg-white px-5 py-3">
      <div className="flex items-center gap-4">
        <OneDentLogo />
        <span className="hidden items-center gap-1.5 text-sm text-[#64748b] sm:flex">
          <LayoutGrid className="h-4 w-4" /> {CABINET.name}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: doctor.avatarColor }}>
            {initials(doctor.name)}
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-bold leading-tight text-[#0f172a]">{doctor.name}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 rounded-xl border border-[#e8e3d9] px-3 py-2 text-sm font-semibold text-[#64748b] transition-colors hover:bg-[#faf8f4]"
        >
          <LogOut className="h-4 w-4" /> Выход
        </button>
      </div>
    </header>
  );
}

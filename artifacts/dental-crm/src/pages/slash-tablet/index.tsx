import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, LayoutGrid } from "lucide-react";
import { LockScreen } from "./lock-screen";
import { PatientList } from "./patient-list";
import { PatientCard } from "./patient-card";
import { TabletDoctorSetup } from "./tablet-doctor-setup";
import { initials, type TabletDoctor } from "./mock-data";
import { OneDentLogo } from "./onedent-logo";
import { resolveCabinetIdFromUrl } from "@/lib/tablet-api";
import { useAuthStore } from "@/hooks/use-auth";
import { clearTabletSessionAuth } from "@/lib/tablet-auth";

type Step = "lock" | "patients" | "card";

function isTabletManagerRole(role: string | undefined) {
  return role === "doctor" || role === "owner" || role === "admin";
}

export default function SlashTabletPage() {
  const { user, isAuthenticated } = useAuthStore();
  const hasCabinet = Boolean(resolveCabinetIdFromUrl());
  const setupMode = useMemo(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("setup") === "1",
    [],
  );
  const showDoctorSetup =
    setupMode && isAuthenticated && isTabletManagerRole(user?.role) && !hasCabinet;

  const [step, setStep] = useState<Step>("lock");
  const [doctor, setDoctor] = useState<TabletDoctor | null>(null);
  const [cabinetName, setCabinetName] = useState("Кабинет");
  const [patientId, setPatientId] = useState<string | null>(null);

  const logout = () => {
    clearTabletSessionAuth();
    setStep("lock");
    setDoctor(null);
    setPatientId(null);
  };

  if (showDoctorSetup) {
    return <TabletDoctorSetup />;
  }

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[var(--bg)] font-manrope" data-slash-tablet>
      <AnimatePresence mode="wait">
        {step === "lock" && (
          <motion.div key="lock" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LockScreen
              onQrUnlock={({ doctor: doc, cabinet }) => {
                setDoctor(doc);
                setCabinetName(cabinet.name);
                setStep("patients");
              }}
            />
          </motion.div>
        )}

        {step === "patients" && doctor && (
          <motion.div
            key="patients"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex h-[100dvh] flex-col"
          >
            <TabletTopBar doctor={doctor} cabinetName={cabinetName} onLogout={logout} />
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

function TabletTopBar({
  doctor,
  cabinetName,
  onLogout,
}: {
  doctor: TabletDoctor;
  cabinetName: string;
  onLogout: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--ds-border)] bg-[var(--ds-surface)] px-5 py-3">
      <div className="flex items-center gap-4">
        <OneDentLogo />
        <span className="flex items-center gap-1.5 text-body text-[var(--text-secondary)]">
          <LayoutGrid className="h-4 w-4" /> {cabinetName}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full text-caption font-bold text-white"
            style={{ backgroundColor: doctor.avatarColor }}>
            {initials(doctor.name)}
          </div>
          <div className="text-right">
            <p className="text-body font-bold leading-tight text-[var(--text)]">{doctor.name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--ds-border)] px-3 py-2 text-body font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg)]"
        >
          <LogOut className="h-4 w-4" /> Выход
        </button>
      </div>
    </header>
  );
}

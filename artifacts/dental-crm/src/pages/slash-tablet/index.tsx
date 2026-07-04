import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";
import { LockScreen } from "./lock-screen";
import { CabinetConfirm } from "./cabinet-confirm";
import { CABINET } from "./mock-data";
import { setCabinetSession } from "./tablet-session";
import type { TabletDoctor } from "./mock-data";

type Step = "lock" | "confirm";

export default function SlashTabletPage() {
  const [step, setStep] = useState<Step>("lock");
  const [, navigate] = useLocation();

  const handleConfirm = (doctor: TabletDoctor) => {
    setCabinetSession(doctor, CABINET.id);
    navigate("/tablet/workspace/patients");
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
            <CabinetConfirm onConfirm={handleConfirm} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

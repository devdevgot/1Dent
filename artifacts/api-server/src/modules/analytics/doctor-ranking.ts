export type DoctorRankingOptions = {
  serviceType?: string;
  urgency?: "urgent" | "soon" | "planned";
  returningPatientDoctorId?: string;
};

export type RankedDoctorCandidate = {
  id: string;
  specialty: string | null;
  finalScore: number;
  rankPercent: number;
  hasCapacity: boolean;
  nearestSlotMinutes: number | null;
};

const SERVICE_SPECIALTY_HINTS: Record<string, string[]> = {
  therapy: ["therapist", "general", "терапевт", "терапия", "дантист", "dentist"],
  hygiene: ["hygienist", "therapist", "гигиен", "терапевт"],
  surgery: ["surgeon", "хирург", "surgery"],
  orthopedics: ["orthoped", "ортопед", "prosth"],
  orthodontics: ["orthodont", "ортодонт", "braces", "брекет"],
  implantation: ["implant", "implantolog", "хирург", "surgeon"],
  consultation: ["therapist", "general", "терапевт"],
};

export function specialtyMatchesService(serviceType: string | undefined, specialty: string | null): boolean {
  if (!serviceType || !specialty) return false;
  const hints = SERVICE_SPECIALTY_HINTS[serviceType];
  if (!hints) return false;
  const lower = specialty.toLowerCase();
  return hints.some((h) => lower.includes(h));
}

/** Sort doctors by patient-facing rating (rankPercent), then practical tie-breakers. */
export function compareDoctorCandidates(
  a: RankedDoctorCandidate,
  b: RankedDoctorCandidate,
  opts: DoctorRankingOptions = {},
): number {
  if (opts.returningPatientDoctorId) {
    if (a.id === opts.returningPatientDoctorId && b.id !== opts.returningPatientDoctorId) return -1;
    if (b.id === opts.returningPatientDoctorId && a.id !== opts.returningPatientDoctorId) return 1;
  }

  if (b.rankPercent !== a.rankPercent) return b.rankPercent - a.rankPercent;

  if (a.hasCapacity !== b.hasCapacity) return a.hasCapacity ? -1 : 1;

  const aSpecialty = specialtyMatchesService(opts.serviceType, a.specialty) ? 1 : 0;
  const bSpecialty = specialtyMatchesService(opts.serviceType, b.specialty) ? 1 : 0;
  if (bSpecialty !== aSpecialty) return bSpecialty - aSpecialty;

  if (opts.urgency === "urgent") {
    const aMinutes = a.nearestSlotMinutes ?? 9999;
    const bMinutes = b.nearestSlotMinutes ?? 9999;
    if (aMinutes !== bMinutes) return aMinutes - bMinutes;
  }

  return b.finalScore - a.finalScore;
}

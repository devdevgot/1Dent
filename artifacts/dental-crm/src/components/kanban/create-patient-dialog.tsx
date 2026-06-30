import { useState, useMemo } from "react";
import {
  useCreatePatient,
  useListUsers,
  useListChannels,
  useListPatients,
  getListPatientsQueryKey,
  getListUsersQueryKey,
  getListChannelsQueryKey,
} from "@workspace/api-client-react";
import type { Patient } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { parseIIN, isIINError } from "@workspace/api-zod";
import { AppDialog } from "@/components/layout/app-dialog";

interface CreatePatientDialogProps {
  open: boolean;
  onClose: () => void;
  onExistingPatient?: (patientId: string) => void;
}

const SOURCE_KEYS = ["referral", "walk_in"] as const;

function formatDob(dob: string | null | undefined): string {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d.getTime())) return dob;
  return d.toLocaleDateString("ru-RU");
}

export function CreatePatientDialog({ open, onClose, onExistingPatient }: CreatePatientDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [iin, setIin] = useState("");
  const [iinError, setIinError] = useState<string | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">("");
  const [source, setSource] = useState<string>("walk_in");
  const [doctorId, setDoctorId] = useState("");
  const [notes, setNotes] = useState("");

  const { data: usersData } = useListUsers({
    query: {
      queryKey: getListUsersQueryKey(),
      enabled: user?.role === "owner" || user?.role === "admin",
    },
  });
  const doctors = usersData?.data?.users?.filter((u) => u.role === "doctor") ?? [];

  const { data: channelsData } = useListChannels({
    query: {
      queryKey: getListChannelsQueryKey(),
      enabled: user?.role === "owner" || user?.role === "admin",
    },
  });
  const channels = channelsData?.data?.channels ?? [];

  const { data: patientsData } = useListPatients({
    query: {
      queryKey: getListPatientsQueryKey(),
      staleTime: 60_000,
    },
  });
  const allPatients: Patient[] = patientsData?.data?.patients ?? [];

  const foundPatient = useMemo<Patient | null>(() => {
    if (iin.length !== 12 || iinError) return null;
    return allPatients.find((p) => p.iin === iin) ?? null;
  }, [iin, iinError, allPatients]);

  const mutation = useCreatePatient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        toast({ title: t("createPatient.successTitle") });
        onClose();
      },
      onError: () => {
        toast({
          title: t("createPatient.errorTitle"),
          description: t("createPatient.errorDesc"),
          variant: "destructive",
        });
      },
    },
  });

  const handleIINChange = (value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(0, 12);
    setIin(cleaned);

    if (cleaned.length < 12) {
      setIinError(null);
      setDateOfBirth("");
      setGender("");
      return;
    }

    const result = parseIIN(cleaned);
    if (isIINError(result)) {
      setIinError(result.error);
      setDateOfBirth("");
      setGender("");
    } else {
      setIinError(null);
      const d = result.dateOfBirth;
      setDateOfBirth(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
      setGender(result.gender);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (iin && iinError) return;
    if (foundPatient) return;
    mutation.mutate({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        iin: iin || undefined,
        dateOfBirth: dateOfBirth || undefined,
        gender: gender || undefined,
        source: source as Parameters<typeof mutation.mutate>[0]["data"]["source"],
        doctorId: doctorId || undefined,
        notes: notes.trim() || undefined,
      },
    });
  };

  const genderLabel = (g: string) => {
    if (g === "male") return t("gender.male");
    if (g === "female") return t("gender.female");
    if (g === "other") return t("gender.other");
    return t("gender.notSpecified");
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      title={t("createPatient.title")}
      size="md"
      bodyClassName="!py-0 custom-scrollbar"
      footer={
        !foundPatient ? (
          <>
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              {t("createPatient.cancel")}
            </Button>
            <Button
              form="create-patient-form"
              type="submit"
              className="flex-1"
              disabled={mutation.isPending || (iin.length > 0 && !!iinError)}
            >
              {mutation.isPending ? t("createPatient.submitting") : t("createPatient.submit")}
            </Button>
          </>
        ) : undefined
      }
    >
      <form id="create-patient-form" onSubmit={handleSubmit} className="space-y-4 py-5">

        {/* ИИН */}
        <div>
          <label className="text-sm font-medium text-[var(--text)] mb-1 block">{t("createPatient.iin")}</label>
          <input
            type="text"
            value={iin}
            onChange={(e) => handleIINChange(e.target.value)}
            maxLength={12}
            inputMode="numeric"
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono ${
              iinError ? "border-red-400 bg-red-50" : foundPatient ? "border-green-400 bg-green-50" : "border-[var(--ds-border)]"
            }`}
            placeholder={t("createPatient.iinPlaceholder")}
          />
          {iinError && <p className="text-xs text-red-500 mt-1">{iinError}</p>}
          {!iinError && iin.length === 0 && (
            <p className="text-xs text-[var(--text-secondary)] mt-1">{t("createPatient.iinHint")}</p>
          )}
        </div>

        {/* Карточка найденного пациента */}
        {foundPatient && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-sm font-semibold text-green-800">{t("createPatient.foundPatientTitle")}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[var(--text)]">{foundPatient.name}</p>
              <p className="text-xs text-[var(--text-secondary)]">{foundPatient.phone}</p>
              {foundPatient.dateOfBirth && (
                <p className="text-xs text-[var(--text-secondary)]">{formatDob(foundPatient.dateOfBirth)}</p>
              )}
              {foundPatient.gender && (
                <p className="text-xs text-[var(--text-secondary)]">{genderLabel(foundPatient.gender)}</p>
              )}
            </div>
            <p className="text-xs text-green-700">{t("createPatient.foundPatientHint")}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm"
                onClick={() => { onClose(); onExistingPatient?.(foundPatient.id); }}
              >
                {t("createPatient.foundPatientOpen")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 text-sm"
                onClick={() => { setIin(""); setIinError(null); setDateOfBirth(""); setGender(""); }}
              >
                {t("createPatient.foundPatientCreate")}
              </Button>
            </div>
          </div>
        )}

        {/* Остальные поля */}
        {!foundPatient && (
          <>
            <div>
              <label className="text-sm font-medium text-[var(--text)] mb-1 block">{t("createPatient.fullName")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                className="w-full border border-[var(--ds-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder={t("createPatient.fullNamePlaceholder")}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[var(--text)] mb-1 block">{t("createPatient.phone")}</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                minLength={5}
                className="w-full border border-[var(--ds-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder={t("createPatient.phonePlaceholder")}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-[var(--text)] mb-1 block">{t("createPatient.dateOfBirth")}</label>
                <div className={`w-full border rounded-lg px-3 py-2 text-sm min-h-[38px] flex items-center ${
                  dateOfBirth ? "border-primary/30 bg-primary/5 text-[var(--text)]" : "border-[var(--ds-border)] bg-[var(--bg)] text-[var(--text-subtle)]"
                }`}>
                  {dateOfBirth
                    ? new Date(dateOfBirth).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
                    : <span className="text-[var(--text-subtle)]">из ИИН</span>}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--text)] mb-1 block">{t("createPatient.gender")}</label>
                <div className={`w-full border rounded-lg px-3 py-2 text-sm min-h-[38px] flex items-center ${
                  gender ? "border-primary/30 bg-primary/5 text-[var(--text)]" : "border-[var(--ds-border)] bg-[var(--bg)] text-[var(--text-subtle)]"
                }`}>
                  {gender ? genderLabel(gender) : <span className="text-[var(--text-subtle)]">из ИИН</span>}
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-[var(--text)] mb-1 block">{t("createPatient.source")}</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full border border-[var(--ds-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-[var(--ds-surface)]"
              >
                {SOURCE_KEYS.map((s) => (
                  <option key={s} value={s}>{t(`source.${s}`)}</option>
                ))}
                {channels.length > 0 && (
                  <optgroup label={t("channels.sectionTitle")}>
                    {channels.map((c) => (
                      <option key={c.id} value={`ref:${c.refCode}`}>{c.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {doctors.length > 0 && (
              <div>
                <label className="text-sm font-medium text-[var(--text)] mb-1 block">{t("createPatient.doctor")}</label>
                <select
                  value={doctorId}
                  onChange={(e) => setDoctorId(e.target.value)}
                  className="w-full border border-[var(--ds-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-[var(--ds-surface)]"
                >
                  <option value="">{t("createPatient.noDoctor")}</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-[var(--text)] mb-1 block">{t("createPatient.notes")}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full border border-[var(--ds-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                placeholder={t("createPatient.notesPlaceholder")}
              />
            </div>
          </>
        )}

      </form>
    </AppDialog>
  );
}

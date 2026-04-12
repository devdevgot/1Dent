import { useState } from "react";
import {
  useCreatePatient,
  useListUsers,
  useListChannels,
  getListPatientsQueryKey,
  getListUsersQueryKey,
  getListChannelsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { parseIIN, isIINError } from "@workspace/api-zod";

interface CreatePatientDialogProps {
  onClose: () => void;
}

const SOURCE_KEYS = ["instagram", "referral", "walk_in", "website", "whatsapp", "other"] as const;

export function CreatePatientDialog({ onClose }: CreatePatientDialogProps) {
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
  const [source, setSource] = useState<string>("other");
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

    if (cleaned.length === 0) {
      setIinError(null);
      return;
    }

    if (cleaned.length < 12) {
      setIinError(null);
      return;
    }

    const result = parseIIN(cleaned);
    if (isIINError(result)) {
      setIinError(result.error);
    } else {
      setIinError(null);
      if (!dateOfBirth) {
        const d = result.dateOfBirth;
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        setDateOfBirth(`${yyyy}-${mm}-${dd}`);
      }
      if (!gender) {
        setGender(result.gender);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (iin && iinError) return;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">{t("createPatient.title")}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">{t("createPatient.fullName")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder={t("createPatient.fullNamePlaceholder")}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">{t("createPatient.phone")}</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              minLength={5}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder={t("createPatient.phonePlaceholder")}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">{t("createPatient.iin")}</label>
            <input
              type="text"
              value={iin}
              onChange={(e) => handleIINChange(e.target.value)}
              maxLength={12}
              inputMode="numeric"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono ${
                iinError ? "border-red-400 bg-red-50" : "border-border"
              }`}
              placeholder={t("createPatient.iinPlaceholder")}
            />
            {iinError && (
              <p className="text-xs text-red-500 mt-1">{iinError}</p>
            )}
            {!iinError && iin.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">{t("createPatient.iinHint")}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">{t("createPatient.dateOfBirth")}</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">{t("createPatient.gender")}</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as "male" | "female" | "other" | "")}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              >
                <option value="">{t("gender.notSpecified")}</option>
                <option value="male">{t("gender.male")}</option>
                <option value="female">{t("gender.female")}</option>
                <option value="other">{t("gender.other")}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">{t("createPatient.source")}</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
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
              <label className="text-sm font-medium text-foreground mb-1 block">{t("createPatient.doctor")}</label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              >
                <option value="">{t("createPatient.noDoctor")}</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">{t("createPatient.notes")}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              placeholder={t("createPatient.notesPlaceholder")}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              {t("createPatient.cancel")}
            </Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending || (iin.length > 0 && !!iinError)}>
              {mutation.isPending ? t("createPatient.submitting") : t("createPatient.submit")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

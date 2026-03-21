import { useState } from "react";
import {
  useCreatePatient,
  useListUsers,
  getListPatientsQueryKey,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface CreatePatientDialogProps {
  onClose: () => void;
}

const SOURCES = [
  { value: "instagram", label: "Instagram" },
  { value: "referral", label: "Направление" },
  { value: "walk_in", label: "Самостоятельно" },
  { value: "website", label: "Сайт" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "other", label: "Другое" },
] as const;

export function CreatePatientDialog({ onClose }: CreatePatientDialogProps) {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
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

  const mutation = useCreatePatient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
        toast({ title: "Пациент добавлен" });
        onClose();
      },
      onError: () => {
        toast({ title: "Ошибка", description: "Не удалось добавить пациента", variant: "destructive" });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        age: age ? parseInt(age, 10) : undefined,
        source: source as Parameters<typeof mutation.mutate>[0]["data"]["source"],
        doctorId: doctorId || undefined,
        notes: notes.trim() || undefined,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">Новый пациент</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">ФИО *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Иванов Иван Иванович"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Телефон *</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              minLength={5}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="+7 900 000 00 00"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Возраст</label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                min={0}
                max={150}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="30"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Источник</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {doctors.length > 0 && (
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Врач</label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              >
                <option value="">Не назначен</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Заметки</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              placeholder="Дополнительная информация..."
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Сохранение..." : "Добавить"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

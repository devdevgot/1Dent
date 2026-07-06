import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useUpdateProfile } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Camera, Loader2 } from "lucide-react";
import PhotoCropModal from "@/components/account/photo-crop-modal";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { IosGroup } from "@/components/layout/ios-group";
import { Button } from "@/components/ui/button";

export default function AccountEditProfile() {
  const [, setLocation] = useLocation();
  const { user, clinic, setAuth } = useAuthStore();
  const { toast } = useToast();

  const photoUrl = (user as typeof user & { photoUrl?: string | null })?.photoUrl ?? null;
  const [name, setName] = useState(user?.name ?? "");
  const [photoPreview, setPhotoPreview] = useState<string | null>(photoUrl);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mutation = useUpdateProfile({
    mutation: {
      onSuccess: (res) => {
        if (res.success && user && clinic) {
          setAuth({ ...user, ...(res.data.user as any) }, clinic);
          toast({ title: "Профиль обновлён" });
          setLocation("/account-settings");
        } else {
          toast({ title: "Ошибка", description: "Не удалось сохранить", variant: "destructive" });
        }
      },
      onError: (err) => {
        const msg = (err as { data?: { error?: string } }).data?.error;
        toast({ title: "Ошибка", description: msg ?? "Не удалось сохранить", variant: "destructive" });
      },
    },
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
      setIsCropOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropComplete = (croppedBase64: string) => {
    setPhotoPreview(croppedBase64);
    setPendingPhoto(croppedBase64);
  };

  function handleSave() {
    const updates: { name?: string; photoUrl?: string | null } = {};
    if (name.trim() && name.trim() !== user?.name) updates.name = name.trim();
    if (pendingPhoto !== null) updates.photoUrl = pendingPhoto;
    if (Object.keys(updates).length === 0) {
      toast({ title: "Нет изменений" });
      return;
    }
    mutation.mutate(updates);
  }

  const initials = (user?.name ?? "?").charAt(0).toUpperCase();

  return (
    <PageShell animate={false}>
      <PageHeader
        title="Имя и фото"
        onBack={() => setLocation("/account-settings")}
        sticky
      />

      <div className="px-4 py-6 space-y-5">
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-[#1f75fe]/10 flex items-center justify-center text-[#1f75fe] font-bold text-3xl border border-[#e8e3d9] shadow-sm transition-transform active:scale-95 duration-100">
              {photoPreview ? (
                <img src={photoPreview} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#1f75fe] flex items-center justify-center shadow-lg border-2 border-white hover:bg-[#1a65e8] transition-colors"
            >
              <Camera className="w-4 h-4 text-white" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </div>
          <Button
            variant="link"
            size="sm"
            className="text-caption h-auto p-0 text-[#1f75fe]"
            onClick={() => fileInputRef.current?.click()}
          >
            Изменить фото
          </Button>
        </div>

        <IosGroup>
          <label className="flex flex-col px-4 py-3.5 gap-0.5">
            <span className="section-label">Ваше имя</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-body text-[#0f172a] bg-transparent outline-none placeholder:text-[#94a3b8] mt-0.5"
              placeholder="Введите имя"
              autoFocus
            />
          </label>
        </IosGroup>

        <Button
          className="w-full py-3.5 rounded-full text-body font-semibold hover:scale-105 active:scale-95"
          onClick={handleSave}
          disabled={mutation.isPending}
        >
          {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Сохранить
        </Button>
      </div>

      {selectedImage && (
        <PhotoCropModal
          isOpen={isCropOpen}
          onClose={() => {
            setIsCropOpen(false);
            setSelectedImage(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          imageSrc={selectedImage}
          onCrop={handleCropComplete}
        />
      )}
    </PageShell>
  );
}

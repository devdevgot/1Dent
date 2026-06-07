import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useUpdateProfile } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Camera, Loader2 } from "lucide-react";
import PhotoCropModal from "@/components/account/photo-crop-modal";

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
        }
        toast({ title: "Профиль обновлён" });
        setLocation("/account-settings");
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
    <div className="min-h-full bg-[#f2f2f7]">
      <div className="bg-white px-4 pt-12 pb-3 flex items-center gap-3 border-b border-gray-100 shadow-sm">
        <button onClick={() => setLocation("/account-settings")} className="p-1 -ml-1 text-gray-500">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Имя и фото</h1>
      </div>

      <div className="px-4 py-6 space-y-5">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-primary/15 flex items-center justify-center text-primary font-bold text-3xl border border-slate-100 shadow-sm transition-transform active:scale-95 duration-100">
              {photoPreview ? (
                <img src={photoPreview} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg border border-white hover:bg-primary/95 transition-colors"
            >
              <Camera className="w-4 h-4 text-white" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[13px] text-primary font-semibold hover:underline"
          >
            Изменить фото
          </button>
        </div>

        {/* Name */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100">
          <label className="flex flex-col px-4 py-3.5 gap-0.5">
            <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Ваше имя</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-[15px] text-gray-900 bg-transparent outline-none placeholder-gray-300 mt-0.5"
              placeholder="Введите имя"
              autoFocus
            />
          </label>
        </div>

        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="w-full py-3.5 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-primary/95 transition-colors shadow-sm disabled:opacity-50"
          style={{ backgroundColor: "#1f75fe", color: "#ffffff" }}
        >
          {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Сохранить
        </button>
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
    </div>
  );
}

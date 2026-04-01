import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { useUpdateProfile, useChangePassword } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Camera, Eye, EyeOff, Loader2, Check } from "lucide-react";

const PHOTO_SIZE = 200;

function resizeToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const size = Math.min(img.width, img.height);
      canvas.width = PHOTO_SIZE;
      canvas.height = PHOTO_SIZE;
      const ctx = canvas.getContext("2d")!;
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function AccountSettings() {
  const [, setLocation] = useLocation();
  const { user, clinic, setAuth } = useAuthStore();
  const { toast } = useToast();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    (user as typeof user & { photoUrl?: string | null })?.photoUrl ?? null,
  );
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const profileMutation = useUpdateProfile({
    mutation: {
      onSuccess: (res) => {
        if (res.success) {
          const updatedUser = res.data.user as typeof user;
          if (updatedUser && user && clinic) {
            setAuth({ ...user, ...updatedUser } as typeof user, clinic);
          }
          setPendingPhoto(null);
          toast({ title: "Профиль обновлён" });
        }
      },
      onError: (err) => {
        const msg = (err as { data?: { error?: string } }).data?.error;
        toast({ title: "Ошибка", description: msg ?? "Не удалось сохранить", variant: "destructive" });
      },
    },
  });

  const passwordMutation = useChangePassword({
    mutation: {
      onSuccess: () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        toast({ title: "Пароль изменён" });
      },
      onError: (err) => {
        const msg = (err as { data?: { error?: string } }).data?.error;
        toast({ title: "Ошибка", description: msg ?? "Неверный текущий пароль", variant: "destructive" });
      },
    },
  });

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await resizeToBase64(file);
      setPhotoPreview(base64);
      setPendingPhoto(base64);
    } catch {
      toast({ title: "Ошибка загрузки фото", variant: "destructive" });
    }
  }

  function handleSaveProfile() {
    const updates: { name?: string; email?: string; photoUrl?: string | null } = {};
    if (name.trim() && name !== user?.name) updates.name = name.trim();
    if (email.trim() && email !== user?.email) updates.email = email.trim();
    if (pendingPhoto !== null) updates.photoUrl = pendingPhoto;
    if (Object.keys(updates).length === 0) {
      toast({ title: "Нет изменений" });
      return;
    }
    profileMutation.mutate(updates);
  }

  function handleSavePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: "Заполните все поля пароля", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Новые пароли не совпадают", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Пароль должен быть не менее 6 символов", variant: "destructive" });
      return;
    }
    passwordMutation.mutate({ data: { currentPassword, newPassword } });
  }

  const initials = (user?.name ?? "?").charAt(0).toUpperCase();
  const displayPhoto = photoPreview;

  return (
    <div className="min-h-full bg-[#f2f2f7]">
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-3 flex items-center gap-3 border-b border-gray-100">
        <button onClick={() => setLocation("/menu")} className="p-1 -ml-1 text-gray-500">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Настройки аккаунта</h1>
      </div>

      <div className="px-4 py-5 space-y-5">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="relative">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-primary/15 flex items-center justify-center text-primary font-bold text-2xl">
              {displayPhoto ? (
                <img src={displayPhoto} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-md"
            >
              <Camera className="w-3.5 h-3.5 text-white" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>
          <p className="text-xs text-gray-400">Нажмите на значок камеры, чтобы изменить фото</p>
        </div>

        {/* Profile info */}
        <div className="bg-white rounded-2xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Личные данные</p>
          </div>
          <div className="divide-y divide-gray-100">
            <label className="flex flex-col px-4 py-3 gap-0.5">
              <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Имя</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-[15px] text-gray-900 bg-transparent outline-none placeholder-gray-300"
                placeholder="Введите имя"
              />
            </label>
            <label className="flex flex-col px-4 py-3 gap-0.5">
              <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="text-[15px] text-gray-900 bg-transparent outline-none placeholder-gray-300"
                placeholder="email@clinic.com"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </label>
          </div>
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={profileMutation.isPending}
          className="w-full py-3.5 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2"
          style={{ backgroundColor: "#98cc1c", color: "#1a2204" }}
        >
          {profileMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          Сохранить профиль
        </button>

        {/* Password change */}
        <div className="bg-white rounded-2xl overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Изменить пароль</p>
          </div>
          <div className="divide-y divide-gray-100">
            <label className="flex flex-col px-4 py-3 gap-0.5">
              <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Текущий пароль</span>
              <div className="flex items-center">
                <input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="flex-1 text-[15px] text-gray-900 bg-transparent outline-none placeholder-gray-300"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowCurrent((v) => !v)} className="ml-2 text-gray-400">
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
            <label className="flex flex-col px-4 py-3 gap-0.5">
              <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Новый пароль</span>
              <div className="flex items-center">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="flex-1 text-[15px] text-gray-900 bg-transparent outline-none placeholder-gray-300"
                  placeholder="Мин. 6 символов"
                />
                <button type="button" onClick={() => setShowNew((v) => !v)} className="ml-2 text-gray-400">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
            <label className="flex flex-col px-4 py-3 gap-0.5">
              <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Повторите новый пароль</span>
              <div className="flex items-center">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="flex-1 text-[15px] text-gray-900 bg-transparent outline-none placeholder-gray-300"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowConfirm((v) => !v)} className="ml-2 text-gray-400">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
          </div>
        </div>

        <button
          onClick={handleSavePassword}
          disabled={passwordMutation.isPending}
          className="w-full py-3.5 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-800"
        >
          {passwordMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : (
            <Check className="w-4 h-4 text-gray-500" />
          )}
          Изменить пароль
        </button>
      </div>
    </div>
  );
}

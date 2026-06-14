import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuthStore } from "@/hooks/use-auth";
import { ChevronRight, User, Mail, Lock, Camera, Banknote, CheckCircle, Clock } from "lucide-react";
import { useGetMyPayrollRecords, useUpdateProfile, type PayrollRecord } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import PhotoCropModal from "@/components/account/photo-crop-modal";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { IosGroup, IosGroupRow, IosSection } from "@/components/layout/ios-group";
import { Button } from "@/components/ui/button";

const rowMotion = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.24, ease: [0.16, 1, 0.3, 1] },
  }),
};

export default function AccountSettings() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { user, clinic, setAuth } = useAuthStore();
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);

  const { data: myPayrollData } = useGetMyPayrollRecords();
  const myRecords: PayrollRecord[] = myPayrollData?.data?.records ?? [];

  const [photoVersion, setPhotoVersion] = useState(0);

  const updateMutation = useUpdateProfile({
    mutation: {
      onSuccess: (res) => {
        if (res.success && user && clinic) {
          setAuth({ ...user, ...(res.data.user as Record<string, unknown>) }, clinic);
          setPhotoVersion((v) => v + 1);
        }
        toast({ title: t("settingsPage.photoUpdated") });
      },
      onError: (err) => {
        const msg = (err as { data?: { error?: string } }).data?.error;
        toast({
          title: t("common.error"),
          description: msg ?? t("settingsPage.photoUpdateError"),
          variant: "destructive",
        });
      },
    },
  });

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleCropComplete = async (croppedBase64: string) => {
    updateMutation.mutate({ photoUrl: croppedBase64 });
  };

  const photoUrl = (user as typeof user & { photoUrl?: string | null })?.photoUrl;
  const initials = (user?.name ?? "?").charAt(0).toUpperCase();

  const items = [
    {
      icon: User,
      iconClass: "bg-primary text-primary-foreground",
      label: t("settingsPage.name"),
      value: user?.name,
      href: "/account/edit-profile",
    },
    {
      icon: Mail,
      iconClass: "bg-emerald-500 text-white",
      label: t("settingsPage.email"),
      value: user?.email,
      href: "/account/change-email",
    },
    {
      icon: Lock,
      iconClass: "bg-muted-foreground text-white",
      label: t("settingsPage.password"),
      value: "••••••••",
      href: "/account/change-password",
    },
  ];

  return (
    <PageShell animate={false}>
      <PageHeader
        title={t("settingsPage.accountTitle")}
        onBack={() => setLocation("/menu")}
        backLabel={t("common.back")}
        sticky
      />

      <div className="px-4 py-6 space-y-5">
        <motion.div
          className="flex flex-col items-center gap-2 pb-1"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
          >
            <div className="w-20 h-20 rounded-full overflow-hidden bg-primary/12 flex items-center justify-center text-primary font-bold text-2xl border-2 border-border/60 transition-transform active:scale-95 duration-150">
              {photoUrl ? (
                <img key={photoVersion} src={photoUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-md border-2 border-surface">
              <Camera className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
          />
          <Button
            variant="link"
            size="sm"
            className="text-caption h-auto p-0"
            onClick={() => fileInputRef.current?.click()}
          >
            {t("settingsPage.changePhoto")}
          </Button>
        </motion.div>

        <IosSection>
          <IosGroup>
            {items.map((item, index) => (
              <motion.div
                key={item.href}
                custom={index}
                variants={rowMotion}
                initial="hidden"
                animate="show"
              >
                <button
                  type="button"
                  onClick={() => setLocation(item.href)}
                  className="w-full"
                >
                  <IosGroupRow as="div" className="cursor-pointer">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", item.iconClass)}>
                        <item.icon className="w-[18px] h-[18px]" />
                      </div>
                      <p className="text-body text-foreground">{item.label}</p>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-caption text-muted-foreground truncate max-w-[140px]">{item.value}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                    </div>
                  </IosGroupRow>
                </button>
              </motion.div>
            ))}
          </IosGroup>
        </IosSection>

        {(user?.role === "admin" || user?.role === "accountant" || user?.role === "warehouse") && (
          <IosSection title={t("payroll.mySalary")}>
            <IosGroup>
              <div className="flex items-center gap-3 px-4 py-4 border-b border-border/50">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Banknote className="w-[18px] h-[18px] text-primary" />
                </div>
                <div>
                  <p className="text-body font-semibold text-foreground">{t("payroll.mySalary")}</p>
                  <p className="text-caption text-muted-foreground">{t("payroll.mySalaryDesc")}</p>
                </div>
              </div>
              {myRecords.length === 0 ? (
                <div className="px-4 py-6 text-center text-caption text-muted-foreground">
                  {t("payroll.noMySalary")}
                </div>
              ) : (
                <div>
                  {myRecords.slice(0, 6).map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-4 py-3 border-b border-border/40 last:border-b-0">
                      <div>
                        <p className="text-body font-semibold text-foreground">
                          {r.periodMonth.toString().padStart(2, "0")}/{r.periodYear}
                        </p>
                        <p className="text-caption text-muted-foreground">
                          {t("payroll.myCalculated")}: ₸{Number(r.calculatedAmount).toLocaleString("ru-KZ")}
                        </p>
                      </div>
                      <div className="text-right">
                        {r.approvedAmount && (
                          <p className="text-body font-bold text-emerald-600">
                            ₸{Number(r.approvedAmount).toLocaleString("ru-KZ")}
                          </p>
                        )}
                        {r.status === "approved" || r.status === "paid" ? (
                          <span className="inline-flex items-center gap-1 text-micro font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" />
                            {r.status === "paid" ? t("payroll.paid") : t("payroll.approved")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-micro font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3" />
                            {t("payroll.pending")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </IosGroup>
          </IosSection>
        )}
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

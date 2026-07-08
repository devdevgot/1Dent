import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, UserPlus, Bot, Send, Megaphone, Link2, Copy, Check,
  AlertTriangle, MapPin, CheckCircle2, Info, Loader2, ArrowRight, Sparkles, MessageSquare, Play, RefreshCw, Plus, ExternalLink,
  Trash2, Upload, AlignLeft, FileText, ChevronDown
} from "lucide-react";
import { customFetch, useTestChatbotMessage } from "@workspace/api-client-react";
import { schedulePlaygroundBotParts } from "@/lib/chatbot-playground-parts";
import { getApiErrorMessage } from "@/lib/api-error-message";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import "@/styles/dashboard.css";

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
}

type OnboardingStep = "employees" | "chatbot" | "channels" | "tracking" | "completed";

export function OnboardingWizard({ open, onClose }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("employees");
  const [loading, setLoading] = useState(false);

  // --- Step 1: Employees State ---
  const [empName, setEmpName] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empRole, setEmpRole] = useState<"doctor" | "admin" | "accountant" | "warehouse" | "assistant" | "nurse">("doctor");
  const [empSpecialty, setEmpSpecialty] = useState("");
  const [addedEmployees, setAddedEmployees] = useState<Array<{ name: string; email: string; role: string }>>([]);

  // --- Step 2: Chatbot State ---
  const [botUrl, setBotUrl] = useState("");
  const [botTextTitle, setBotTextTitle] = useState("");
  const [botTextContent, setBotTextContent] = useState("");
  const [knowledgeSources, setKnowledgeSources] = useState<Array<{ id: string; type: "url" | "text" | "file"; title: string }>>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [isTrained, setIsTrained] = useState(false);
  const [playgroundInput, setPlaygroundInput] = useState("");
  const [playgroundMessages, setPlaygroundMessages] = useState<Array<{ role: "user" | "bot"; text: string }>>([
    { role: "bot", text: "Привет! Я ИИ-ассистент вашей клиники. Задайте мне любой вопрос о ценах, услугах или расписании." }
  ]);
  const testMessage = useTestChatbotMessage();
  const [activeChatbotTab, setActiveChatbotTab] = useState<"url" | "file" | "text">("url");
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Step 3: Channels State ---
  const [channelName, setChannelName] = useState("");
  const [channelType, setChannelType] = useState<"instagram" | "website" | "2gis" | "referral">("instagram");
  const [channelRef, setChannelRef] = useState("");
  const [addedChannels, setAddedChannels] = useState<Array<{ name: string; type: string; link: string; refCode: string }>>([]);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // --- Step 4: Tracking State ---
  const [branchName, setBranchName] = useState("");
  const [branchLat, setBranchLat] = useState("43.2389");
  const [branchLon, setBranchLon] = useState("76.8897");
  const [branchRadius, setBranchRadius] = useState("100");
  const [addedBranches, setAddedBranches] = useState<Array<{ id: string; name: string; radius: number }>>([]);
  
  const [tgPlatformChatId, setTgPlatformChatId] = useState<string | null>(null);
  const [connectingTg, setConnectingTg] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch current Telegram settings on mount to check connection
  useEffect(() => {
    if (!open) return;
    const checkTg = async () => {
      try {
        const res = await customFetch<{ success: boolean; data?: { telegramPlatformChatId: string | null } }>(
          "/api/clinic/telegram-settings"
        );
        if (res.data?.telegramPlatformChatId) {
          setTgPlatformChatId(res.data.telegramPlatformChatId);
        }
      } catch { /* ignore */ }
    };
    checkTg();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [open]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  if (!open) return null;

  // --- Step 1: Add Employee Handler ---
  const handleAddEmployee = async () => {
    if (!empName.trim() || !empEmail.trim()) {
      toast.error("Заполните ФИО и Email сотрудника");
      return;
    }
    setLoading(true);
    try {
      await customFetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: empName.trim(),
          email: empEmail.trim().toLowerCase(),
          role: empRole,
          phone: empPhone.trim() || undefined,
          specialty: ((empRole === "doctor" || empRole === "assistant" || empRole === "nurse") && empSpecialty.trim()) ? empSpecialty.trim() : undefined,
          salaryType: "fixed", // default salary type for onboarding simplicity
          fixedAmount: 0,
        }),
      });

      setAddedEmployees(prev => [...prev, { name: empName.trim(), email: empEmail.trim(), role: empRole }]);
      toast.success("Сотрудник добавлен", {
        description: `Приглашение отправлено на ${empEmail}`
      });
      // reset form
      setEmpName("");
      setEmpEmail("");
      setEmpPhone("");
      setEmpSpecialty("");
      
      // Auto-advance to Step 2 (chatbot)
      setTimeout(() => {
        setCurrentStep("chatbot");
      }, 1000);
    } catch (err: any) {
      const status = err?.status;
      const msg = status === 409
        ? "Сотрудник с таким email уже существует"
        : "Не удалось добавить сотрудника. Попробуйте еще раз.";
      toast.error("Ошибка добавления", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  // --- Step 2: Chatbot Handlers ---
  const handleAddUrl = async () => {
    if (!botUrl.trim()) return;
    setLoading(true);
    try {
      const res = await customFetch<{ success: boolean; data: { id: string } }>("/api/knowledge/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: botUrl.trim() }),
      });
      setKnowledgeSources(prev => [...prev, { id: res.data.id, type: "url", title: botUrl.trim() }]);
      setBotUrl("");
      toast.success("Ссылка добавлена в базу знаний");
    } catch {
      toast.error("Не удалось добавить ссылку");
    } finally {
      setLoading(false);
    }
  };

  const handleAddText = async () => {
    if (!botTextTitle.trim() || !botTextContent.trim()) return;
    setLoading(true);
    try {
      const res = await customFetch<{ success: boolean; data: { id: string } }>("/api/knowledge/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: botTextTitle.trim(), content: botTextContent.trim() }),
      });
      setKnowledgeSources(prev => [...prev, { id: res.data.id, type: "text", title: botTextTitle.trim() }]);
      setBotTextTitle("");
      setBotTextContent("");
      toast.success("Документ добавлен в базу знаний");
    } catch {
      toast.error("Не удалось добавить документ");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    try {
      const urlRes = await customFetch<{ uploadURL: string; objectPath: string }>("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const { uploadURL, objectPath } = urlRes;

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) throw new Error("Upload failed");

      const regRes = await customFetch<{ success: boolean; data: { source: { id: string; name: string } } }>("/api/knowledge/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath, name: file.name, mimeType: file.type }),
      });

      setKnowledgeSources(prev => [...prev, { id: regRes.data.source.id, type: "file", title: file.name }]);
      toast.success("Файл успешно загружен в базу знаний!");
    } catch (err: any) {
      toast.error("Не удалось загрузить файл", {
        description: err?.message || String(err),
      });
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteSource = async (id: string) => {
    try {
      await customFetch(`/api/knowledge/${id}`, { method: "DELETE" });
      setKnowledgeSources(prev => prev.filter(s => s.id !== id));
      toast.success("Источник удален");
    } catch {
      toast.error("Не удалось удалить источник");
    }
  };

  const handleTrainChatbot = async () => {
    setIsTraining(true);
    setTrainingProgress(10);
    
    // Simulate gradual training progress for rich visual feedback
    const interval = setInterval(() => {
      setTrainingProgress(prev => {
        if (prev >= 95) {
          clearInterval(interval);
          return 95;
        }
        return prev + 15;
      });
    }, 400);

    try {
      await customFetch("/api/knowledge/generate", { method: "POST" });
      clearInterval(interval);
      setTrainingProgress(100);
      setTimeout(() => {
        setIsTraining(false);
        setIsTrained(true);
        toast.success("Чат-бот успешно обучен!");
      }, 500);
    } catch {
      clearInterval(interval);
      setIsTraining(false);
      toast.error("Ошибка при обучении чат-бота");
    }
  };

  const handleSendPlayground = () => {
    const text = playgroundInput.trim();
    if (!text || testMessage.isPending) return;

    const newMsgs = [...playgroundMessages, { role: "user" as const, text }];
    setPlaygroundMessages(newMsgs);
    setPlaygroundInput("");

    const history = newMsgs.slice(1, -1).map(m => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: m.text
    }));

    testMessage.mutate({ userMessage: text, history } as any, {
      onSuccess: (res) => {
        const parts = res.data?.parts?.length ? res.data.parts : [res.data?.reply ?? "..."];
        schedulePlaygroundBotParts(
          parts,
          res.data?.pausesMs,
          (part) => setPlaygroundMessages((prev) => [...prev, { role: "bot", text: part }]),
          () => {},
        );
      },
      onError: (err) => {
        setPlaygroundMessages((prev) => [
          ...prev,
          {
            role: "bot",
            text: getApiErrorMessage(
              err as { data?: unknown; message?: string },
              "Ошибка связи с ассистентом.",
            ),
          },
        ]);
      },
    });
  };

  // --- Step 3: Attraction Channels ---
  const handleAddChannel = async () => {
    if (!channelName.trim() || !channelRef.trim()) {
      toast.error("Укажите название и реферальный код");
      return;
    }
    setLoading(true);
    try {
      await customFetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: channelName.trim(),
          type: channelType,
          refCode: channelRef.trim().toLowerCase(),
        }),
      });

      const refLink = `${window.location.origin}/ref/${channelRef.trim().toLowerCase()}`;
      setAddedChannels(prev => [...prev, {
        name: channelName.trim(),
        type: channelType,
        refCode: channelRef.trim().toLowerCase(),
        link: refLink
      }]);

      toast.success("Канал добавлен!");
      setChannelName("");
      setChannelRef("");
    } catch {
      toast.error("Не удалось добавить канал привлечения");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(link);
    toast.success("Ссылка скопирована!");
    setTimeout(() => setCopiedLink(null), 2000);
  };

  // --- Step 4: Tracking & Branches ---
  const handleAddBranch = async () => {
    if (!branchName.trim()) {
      toast.error("Введите название филиала");
      return;
    }
    setLoading(true);
    try {
      const res = await customFetch<{ success: boolean; data: { id: string } }>("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: branchName.trim(),
          latitude: parseFloat(branchLat) || 43.2389,
          longitude: parseFloat(branchLon) || 76.8897,
          radiusMeters: parseInt(branchRadius) || 100,
        }),
      });

      setAddedBranches(prev => [...prev, {
        id: res.data.id,
        name: branchName.trim(),
        radius: parseInt(branchRadius) || 100
      }]);

      toast.success("Филиал успешно добавлен!");
      setBranchName("");
    } catch {
      toast.error("Не удалось создать филиал");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectTelegram = async () => {
    setConnectingTg(true);
    try {
      const res = await customFetch<{ success: boolean; data: { deepLink: string } }>(
        "/api/clinic/telegram-connect/generate",
        { method: "POST" }
      );
      
      window.open(res.data.deepLink, "_blank");

      // Poll settings for up to 2 minutes to verify successful connection
      let attempts = 0;
      pollIntervalRef.current = setInterval(async () => {
        attempts++;
        try {
          const check = await customFetch<{ success: boolean; data?: { telegramPlatformChatId: string | null } }>(
            "/api/clinic/telegram-settings"
          );
          if (check.data?.telegramPlatformChatId) {
            setTgPlatformChatId(check.data.telegramPlatformChatId);
            setConnectingTg(false);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            toast.success("Telegram-бот успешно подключен!");
          }
        } catch { /* ignore */ }
        
        if (attempts >= 40) {
          setConnectingTg(false);
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          toast.error("Превышено время ожидания. Пожалуйста, попробуйте еще раз.");
        }
      }, 3000);
    } catch (err: any) {
      setConnectingTg(false);
      toast.error("Не удалось инициализировать подключение к Telegram");
    }
  };

  const handleCompleteOnboarding = () => {
    localStorage.removeItem("show_onboarding_wizard");
    localStorage.setItem("onboarding_completed", "true");
    setCurrentStep("completed");
  };

  // Helper labels & maps
  const roleLabels = {
    doctor: "Врач",
    assistant: "Ассистент",
    nurse: "Медсестра",
    admin: "Администратор",
    accountant: "Бухгалтер",
    warehouse: "Склад",
  };

  const channelTypeLabels = {
    instagram: "Instagram",
    website: "Сайт",
    "2gis": "2GIS",
    referral: "Рекомендации",
  };

  const stepsOrder: OnboardingStep[] = ["employees", "chatbot", "channels", "tracking"];
  const currentStepNum = stepsOrder.indexOf(currentStep) + 1;
  const currentStepLabels = {
    employees: "Добавление сотрудников",
    chatbot: "Обучение чат-бота",
    channels: "Каналы рекламы",
    tracking: "Геолокация и Telegram"
  };

  return (
    <AnimatePresence>
      <div className="dash-modal-overlay p-0 sm:p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="dashboard-page dash-modal w-full h-full sm:h-auto sm:max-w-2xl rounded-none sm:rounded-3xl animate-fade-in"
          style={{ maxHeight: "100dvh" }}
        >
          {/* Header Progress indicator */}
          {currentStep !== "completed" && (
            <div className="dash-modal-header">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-lg bg-[var(--primary-light)] text-[var(--ds-primary)]">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-body sm:text-base font-black text-[var(--text)] leading-tight">Быстрый старт в 1Dent</h3>
                    <p className="text-micro text-[var(--text-subtle)] font-semibold hidden sm:block">Настройка основных модулей клиники</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem("show_onboarding_wizard");
                    onClose();
                  }}
                  className="text-caption font-bold text-[var(--text-subtle)] hover:text-[var(--text-secondary)] transition-colors bg-[var(--surface-2)] hover:bg-[var(--surface-2)] border border-[var(--ds-border)]/60 rounded-xl px-3.5 py-1.5 shrink-0"
                >
                  Настрою позже
                </button>
              </div>

              {/* Unified Stories-style progress pills */}
              <div className="flex items-center gap-1.5 mb-2.5">
                {[
                  { id: "employees" },
                  { id: "chatbot" },
                  { id: "channels" },
                  { id: "tracking" }
                ].map((s, idx) => {
                  const stepIdx = stepsOrder.indexOf(s.id as OnboardingStep);
                  const currentIdx = stepsOrder.indexOf(currentStep);
                  const isCompleted = stepIdx < currentIdx;
                  const isActive = s.id === currentStep;

                  return (
                    <div key={s.id} className="flex-1 animate-fade-in">
                      <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden border border-[var(--ds-border)]/20">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500 ease-out",
                            isCompleted ? "bg-[var(--ds-primary)]" : isActive ? "bg-[var(--ds-primary)] animate-pulse" : "bg-[var(--ds-border)]"
                          )}
                          style={{ width: isCompleted || isActive ? "100%" : "0%" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="text-caption sm:text-sm font-extrabold text-[var(--text)]">
                  {currentStepLabels[currentStep as keyof typeof currentStepLabels]}
                </span>
                <span className="text-micro sm:text-xs font-extrabold text-[var(--ds-primary)] bg-[var(--primary-light)] border border-[var(--ds-primary)]/20 px-2.5 py-0.5 rounded-full shrink-0">
                  Шаг {currentStepNum} из 4
                </span>
              </div>
            </div>
          )}

          {/* Steps Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <AnimatePresence mode="wait">
              {/* --- STEP 1: EMPLOYEES --- */}
              {currentStep === "employees" && (
                <motion.div
                  key="employees-step"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-4 sm:space-y-5"
                >
                  <div className="text-center max-w-md mx-auto">
                    <h2 className="text-base sm:text-lg font-black text-[var(--text)]">Добавление команды клиники</h2>
                    <p className="text-caption text-[var(--text-secondary)] mt-1">
                      Добавьте сотрудников, чтобы выслать им временные пароли. Они смогут войти и начать работу с первого дня.
                    </p>
                  </div>

                  <div className="dash-form-card space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-micro font-bold uppercase tracking-wider text-[var(--text-subtle)] mb-1">ФИО сотрудника *</label>
                        <input
                          type="text"
                          value={empName}
                          onChange={e => setEmpName(e.target.value)}
                          placeholder="Иванов Александр"
                          className="w-full border border-[var(--ds-border)] rounded-xl px-3.5 py-2.5 text-body bg-[var(--ds-surface)] focus:outline-none focus:border-[var(--ds-primary)] focus:ring-4 focus:ring-[var(--ds-primary)]/10 transition-all duration-200"
                        />
                      </div>
                      <div>
                        <label className="block text-micro font-bold uppercase tracking-wider text-[var(--text-subtle)] mb-1">Email (Логин) *</label>
                        <input
                          type="email"
                          value={empEmail}
                          onChange={e => setEmpEmail(e.target.value)}
                          placeholder="doctor@1dent.kz"
                          className="w-full border border-[var(--ds-border)] rounded-xl px-3.5 py-2.5 text-body bg-[var(--ds-surface)] focus:outline-none focus:border-[var(--ds-primary)] focus:ring-4 focus:ring-[var(--ds-primary)]/10 transition-all duration-200"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-micro font-bold uppercase tracking-wider text-[var(--text-subtle)] mb-1">Роль сотрудника</label>
                        <select
                          value={empRole}
                          onChange={e => setEmpRole(e.target.value as any)}
                          className="w-full border border-[var(--ds-border)] rounded-xl px-3.5 py-2.5 text-body bg-[var(--ds-surface)] focus:outline-none focus:border-[var(--ds-primary)] focus:ring-4 focus:ring-[var(--ds-primary)]/10 transition-all duration-200"
                        >
                          <option value="doctor">Врач</option>
                          <option value="assistant">Ассистент</option>
                          <option value="nurse">Медсестра</option>
                          <option value="admin">Администратор</option>
                          <option value="accountant">Бухгалтер</option>
                          <option value="warehouse">Склад-менеджер</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-micro font-bold uppercase tracking-wider text-[var(--text-subtle)] mb-1">Телефон</label>
                        <input
                          type="tel"
                          value={empPhone}
                          onChange={e => setEmpPhone(e.target.value)}
                          placeholder="+7 777 123 45 67"
                          className="w-full border border-[var(--ds-border)] rounded-xl px-3.5 py-2.5 text-body bg-[var(--ds-surface)] focus:outline-none focus:border-[var(--ds-primary)] focus:ring-4 focus:ring-[var(--ds-primary)]/10 transition-all duration-200"
                        />
                      </div>
                    </div>

                    {(empRole === "doctor" || empRole === "assistant" || empRole === "nurse") && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="grid grid-cols-1"
                      >
                        <label className="block text-micro font-bold uppercase tracking-wider text-[var(--text-subtle)] mb-1">Специализация (терапевт, хирург и др.)</label>
                        <SpecialtyTagInput
                          values={empSpecialty ? empSpecialty.split(",").map(s => s.trim()).filter(Boolean) : []}
                          onChange={tags => setEmpSpecialty(tags.join(", "))}
                          placeholder="Ортодонт"
                        />
                      </motion.div>
                    )}

                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleAddEmployee}
                      className="w-full py-3 bg-[var(--ds-primary)] hover:bg-[#0053d6] disabled:opacity-60 text-white rounded-xl text-body font-bold flex items-center justify-center gap-2 shadow-md transition-colors"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                      Пригласить и выслать пароль
                    </button>
                  </div>

                  {/* List of added employees */}
                  {addedEmployees.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-micro font-bold text-[var(--text-subtle)] uppercase tracking-wider">Добавленные сотрудники ({addedEmployees.length})</h4>
                      <div className="max-h-[120px] overflow-y-auto border border-[var(--ds-border)] rounded-2xl divide-y divide-[var(--ds-border)] bg-[var(--ds-surface)] shadow-sm">
                        {addedEmployees.map((e, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 hover:bg-[var(--surface-2)] transition-colors">
                            <div className="min-w-0 flex-1 pr-2">
                              <p className="text-caption font-bold text-[var(--text)] truncate">{e.name}</p>
                              <p className="text-micro text-[var(--text-subtle)] truncate">{e.email}</p>
                            </div>
                            <span className="text-micro font-bold uppercase tracking-wider text-blue-600 bg-[var(--primary-light)] border border-[var(--ds-primary)]/50 px-2 py-0.5 rounded-full shrink-0">
                              {roleLabels[e.role as keyof typeof roleLabels]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}


                </motion.div>
              )}

              {/* --- STEP 2: CHATBOT TRAINING & PLAYGROUND --- */}
              {currentStep === "chatbot" && (
                <motion.div
                  key="chatbot-step"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-4 sm:space-y-5"
                >
                  <div className="text-center max-w-md mx-auto">
                    <h2 className="text-base sm:text-lg font-black text-[var(--text)]">Настройка и обучение ИИ чат-бота</h2>
                    <p className="text-caption text-[var(--text-secondary)] mt-1">
                      Дайте чат-боту информацию о вашей клинике (цены, услуги), чтобы обучить его отвечать на вопросы пациентов в WhatsApp.
                    </p>
                  </div>

                  {!isTrained ? (
                    <div className="space-y-4">
                      {/* Premium Tabs Selection */}
                      <div className="flex p-1 bg-[var(--surface-2)] rounded-xl">
                        <button
                          type="button"
                          onClick={() => setActiveChatbotTab("url")}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-caption font-bold transition-all flex items-center justify-center gap-1.5",
                            activeChatbotTab === "url"
                              ? "bg-[var(--ds-surface)] text-[var(--text)] shadow-sm"
                              : "text-[var(--text-secondary)] hover:text-[var(--text)]"
                          )}
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          Ссылка
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveChatbotTab("file")}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-caption font-bold transition-all flex items-center justify-center gap-1.5",
                            activeChatbotTab === "file"
                              ? "bg-[var(--ds-surface)] text-[var(--text)] shadow-sm"
                              : "text-[var(--text-secondary)] hover:text-[var(--text)]"
                          )}
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Файл / Фото
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveChatbotTab("text")}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-caption font-bold transition-all flex items-center justify-center gap-1.5",
                            activeChatbotTab === "text"
                              ? "bg-[var(--ds-surface)] text-[var(--text)] shadow-sm"
                              : "text-[var(--text-secondary)] hover:text-[var(--text)]"
                          )}
                        >
                          <AlignLeft className="w-3.5 h-3.5" />
                          Текст
                        </button>
                      </div>

                      <div className="dash-form-card min-h-[140px] flex flex-col justify-center animate-fade-in">
                        {/* URL TAB */}
                        {activeChatbotTab === "url" && (
                          <div className="space-y-2">
                            <label className="block text-micro font-bold uppercase tracking-wider text-[var(--text-subtle)] mb-1">Добавить ссылку на сайт / прайс-лист</label>
                            <div className="flex gap-2">
                              <input
                                type="url"
                                value={botUrl}
                                onChange={e => setBotUrl(e.target.value)}
                                placeholder="https://myclinic.kz/prices"
                                className="flex-1 border border-[var(--ds-border)] rounded-xl px-3.5 py-2 text-body bg-[var(--ds-surface)] focus:outline-none focus:border-[var(--ds-primary)] focus:ring-4 focus:ring-[var(--ds-primary)]/10 transition-all duration-200"
                              />
                              <button
                                type="button"
                                onClick={handleAddUrl}
                                disabled={loading || !botUrl.trim()}
                                className="px-4 py-2 dash-btn-dark disabled:opacity-50 transition-colors shrink-0"
                              >
                                Добавить
                              </button>
                            </div>
                          </div>
                        )}

                        {/* FILE TAB */}
                        {activeChatbotTab === "file" && (
                          <div className="space-y-2">
                            <label className="block text-micro font-bold uppercase tracking-wider text-[var(--text-subtle)] mb-1">Загрузить файлы (PDF, Word) или Фото</label>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploadingFile}
                              className="w-full flex flex-col items-center justify-center gap-2 py-4 px-4 rounded-xl border-2 border-dashed border-[var(--ds-border)] hover:border-[var(--ds-primary)]/50 hover:bg-[var(--ds-primary)]/5 transition-all text-[var(--text-secondary)] disabled:opacity-50 group bg-[var(--ds-surface)]"
                            >
                              {uploadingFile ? (
                                <>
                                  <Loader2 className="w-6 h-6 animate-spin text-[var(--ds-primary)]" />
                                  <span className="text-micro font-bold text-[var(--text)] animate-pulse">Загрузка и извлечение данных...</span>
                                </>
                              ) : (
                                <>
                                  <div className="p-1.5 rounded-full bg-[var(--surface-2)] group-hover:bg-[var(--ds-primary)]/10 transition-colors">
                                    <Upload className="w-4 h-4 text-[var(--text-subtle)] group-hover:text-[var(--ds-primary)] transition-colors" />
                                  </div>
                                  <div className="text-center">
                                    <span className="text-micro font-bold text-[var(--text)] block">Выбрать файл с устройства</span>
                                    <span className="text-micro text-[var(--text-subtle)] mt-0.5 block">PDF, DOCX, JPG, PNG, WEBP — до 10 МБ</span>
                                  </div>
                                </>
                              )}
                            </button>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) {
                                  handleFileUpload(f);
                                }
                              }}
                            />
                          </div>
                        )}

                        {/* TEXT TAB */}
                        {activeChatbotTab === "text" && (
                          <div className="space-y-2">
                            <label className="block text-micro font-bold uppercase tracking-wider text-[var(--text-subtle)]">Вставить текстовую информацию вручную</label>
                            <input
                              type="text"
                              value={botTextTitle}
                              onChange={e => setBotTextTitle(e.target.value)}
                              placeholder="Название документа (напр., Врачи клиники)"
                              className="w-full border border-[var(--ds-border)] rounded-xl px-3.5 py-1.5 text-body bg-[var(--ds-surface)] focus:outline-none focus:border-[var(--ds-primary)] transition-all"
                            />
                            <textarea
                              value={botTextContent}
                              onChange={e => setBotTextContent(e.target.value)}
                              placeholder="Вставьте текстовую информацию сюда (режим работы, цены, услуги)..."
                              rows={3}
                              className="w-full border border-[var(--ds-border)] rounded-xl px-3.5 py-2 text-body bg-[var(--ds-surface)] focus:outline-none focus:border-[var(--ds-primary)] resize-none transition-all"
                            />
                            <button
                              type="button"
                              onClick={handleAddText}
                              disabled={loading || !botTextTitle.trim() || !botTextContent.trim()}
                              className="w-full py-2 dash-btn-dark disabled:opacity-50 transition-colors"
                            >
                              Сохранить документ
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Knowledge Sources List */}
                      {knowledgeSources.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-micro font-bold text-[var(--text-subtle)] uppercase tracking-wider">Добавленные источники ({knowledgeSources.length})</h4>
                          <div className="max-h-[120px] overflow-y-auto border border-[var(--ds-border)] rounded-2xl divide-y divide-[var(--ds-border)] bg-[var(--ds-surface)] shadow-sm">
                            {knowledgeSources.map((source, idx) => (
                              <div key={source.id || idx} className="flex items-center justify-between p-2.5 hover:bg-[var(--surface-2)] transition-colors">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {source.type === "url" && (
                                    <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
                                      <Link2 className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                  {source.type === "file" && (
                                    <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0">
                                      <FileText className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                  {source.type === "text" && (
                                    <span className="p-1.5 rounded-lg bg-[var(--primary-light)] text-blue-600 border border-blue-100 shrink-0">
                                      <AlignLeft className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-caption font-bold text-[var(--text)] truncate">{source.title}</p>
                                    <p className="text-micro text-[var(--text-subtle)] uppercase tracking-wider font-semibold">
                                      {source.type === "url" ? "Ссылка" : source.type === "file" ? "Файл / Фото" : "Текст"}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSource(source.id)}
                                  className="p-1.5 text-[var(--text-subtle)] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors ml-2 shrink-0"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Training Action */}
                      {isTraining ? (
                        <div className="bg-[var(--surface-2)] border border-[var(--ds-border)] rounded-2xl p-5 flex flex-col items-center justify-center space-y-3 animate-pulse">
                          <Loader2 className="w-7 h-7 text-[var(--ds-primary)] animate-spin" />
                          <div className="w-full max-w-xs bg-[var(--ds-border)] rounded-full h-1.5">
                            <div className="bg-[var(--ds-primary)] h-1.5 rounded-full transition-all duration-300" style={{ width: `${trainingProgress}%` }} />
                          </div>
                          <p className="text-micro text-[var(--text-secondary)] font-bold">Анализируем базу знаний и строим mindmap...</p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleTrainChatbot}
                          className="w-full py-3 bg-[var(--ds-primary)] hover:bg-[#0053d6] text-white font-bold rounded-xl text-body flex items-center justify-center gap-2 shadow-md transition-colors"
                        >
                          <Bot className="w-4 h-4" />
                          Обучить чат-бота
                        </button>
                      )}
                    </div>
                  ) : (
                    /* PLAYGROUND IN WIZARD */
                    <div className="space-y-4">
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-3.5 flex items-start gap-2.5 shadow-sm">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-caption sm:text-sm font-bold">Бот успешно обучен и готов к работе!</p>
                          <p className="text-micro sm:text-xs text-emerald-700/95 mt-0.5 leading-normal">
                            Мы построили ментальную карту знаний вашей клиники. Попробуйте написать ему прямо в песочнице ниже, чтобы протестировать его ответы.
                          </p>
                        </div>
                      </div>

                      {/* Playground panel */}
                      <div className="dash-playground h-[180px] sm:h-[220px] flex flex-col shadow-inner">
                        <div className="dash-playground-header flex items-center gap-2">
                          <Bot className="w-3.5 h-3.5 text-[var(--ds-primary)]" />
                          <span className="text-micro sm:text-xs font-bold text-white/80">Тестирование ответов ИИ-бота</span>
                        </div>
                        <div className="flex-1 p-3 overflow-y-auto space-y-2.5 flex flex-col">
                          {playgroundMessages.map((m, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                "max-w-[85%] rounded-2xl px-3 py-2 text-micro leading-relaxed",
                                m.role === "user"
                                  ? "bg-[var(--ds-primary)] text-white self-end rounded-tr-none"
                                  : "bg-[var(--dark-surface)] text-white/90 self-start rounded-tl-none border border-[var(--dark-border)]"
                              )}
                            >
                              {m.text}
                            </div>
                          ))}
                          {testMessage.isPending && (
                            <div className="bg-[var(--dark-surface)] text-white/70 self-start rounded-2xl rounded-tl-none px-3 py-2 text-micro border border-[var(--dark-border)] flex items-center gap-1.5">
                              <Loader2 className="w-3 h-3 animate-spin text-[var(--ds-primary)]" />
                              <span>Бот печатает...</span>
                            </div>
                          )}
                        </div>
                        <div className="p-2 border-t border-[var(--dark-border)] bg-[var(--dark-surface)] flex gap-2">
                          <input
                            type="text"
                            value={playgroundInput}
                            onChange={e => setPlaygroundInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") handleSendPlayground(); }}
                            placeholder="Напишите тестовый вопрос..."
                            className="dash-playground-input"
                          />
                          <button
                            type="button"
                            onClick={handleSendPlayground}
                            disabled={!playgroundInput.trim() || testMessage.isPending}
                            className="w-7.5 h-7.5 bg-[var(--ds-primary)] hover:bg-[#0053d6] disabled:opacity-50 text-white rounded-lg flex items-center justify-center transition-colors"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Footer Navigation */}
                      <div className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center pt-4 border-t border-[var(--ds-border)] shrink-0">
                        <button
                          type="button"
                          onClick={() => setIsTrained(false)}
                          className="text-caption font-bold text-[var(--ds-primary)] hover:underline flex items-center justify-center gap-1 py-1"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Переобучить заново
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrentStep("channels")}
                          className="w-full sm:w-auto px-6 py-3 dash-btn-dark px-6 py-3 text-body flex items-center justify-center gap-2 transition-colors shadow-sm"
                        >
                          Далее к добавлению каналов
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* --- STEP 3: CHANNELS & E2E ANALYTICS WARNING --- */}
              {currentStep === "channels" && (
                <motion.div
                  key="channels-step"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-4 sm:space-y-5"
                >
                  <div className="text-center max-w-md mx-auto">
                    <h2 className="text-base sm:text-lg font-black text-[var(--text)]">Каналы привлечения пациентов</h2>
                    <p className="text-caption text-[var(--text-secondary)] mt-1">
                      Создайте ссылки отслеживания для разных рекламных площадок (Instagram, сайт, 2GIS), чтобы измерять эффективность вашей рекламы.
                    </p>
                  </div>

                  {/* Warning message */}
                  <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-3 sm:p-4 flex gap-2.5 shadow-sm">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-caption font-bold text-amber-800">Сквозная аналитика (Важно!)</p>
                      <p className="text-micro sm:text-xs text-amber-700 mt-0.5 leading-relaxed font-semibold">
                        Пожалуйста, сохраните созданные ссылки и используйте именно их в рекламных кампаниях (в шапке Instagram, на кнопках сайта, в 2GIS).
                        Только так система автоматически определит рекламный источник каждого пациента и посчитает ROI (окупаемость)!
                      </p>
                    </div>
                  </div>

                  <div className="dash-form-card space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-micro font-bold uppercase tracking-wider text-[var(--text-subtle)] mb-1">Название источника *</label>
                        <input
                          type="text"
                          value={channelName}
                          onChange={e => setChannelName(e.target.value)}
                          placeholder="Реклама Instagram июнь"
                          className="w-full border border-[var(--ds-border)] rounded-xl px-3.5 py-2.5 text-body bg-[var(--ds-surface)] focus:outline-none focus:border-[var(--ds-primary)] focus:ring-4 focus:ring-[var(--ds-primary)]/10 transition-all duration-200"
                        />
                      </div>
                      <div>
                        <label className="block text-micro font-bold uppercase tracking-wider text-[var(--text-subtle)] mb-1">Реферальный код *</label>
                        <input
                          type="text"
                          value={channelRef}
                          onChange={e => setChannelRef(e.target.value)}
                          placeholder="ig_june"
                          className="w-full border border-[var(--ds-border)] rounded-xl px-3.5 py-2.5 text-body bg-[var(--ds-surface)] focus:outline-none focus:border-[var(--ds-primary)] focus:ring-4 focus:ring-[var(--ds-primary)]/10 transition-all duration-200"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-micro font-bold uppercase tracking-wider text-[var(--text-subtle)] mb-1.5">Тип канала</label>
                      <div className="grid grid-cols-2 min-[400px]:grid-cols-4 gap-2">
                        {(["instagram", "website", "2gis", "referral"] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setChannelType(t)}
                            className={cn(
                              "py-2 rounded-xl text-caption font-bold border text-center transition-all",
                              channelType === t
                                ? "bg-[var(--text)] border-[var(--text)] text-white shadow-sm"
                                : "bg-[var(--ds-surface)] border-[var(--ds-border)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
                            )}
                          >
                            {channelTypeLabels[t]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleAddChannel}
                      className="w-full py-3 bg-[var(--ds-primary)] hover:bg-[#0053d6] disabled:opacity-60 text-white rounded-xl text-body font-bold flex items-center justify-center gap-2 shadow-md transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Создать ссылку отслеживания
                    </button>
                  </div>

                  {/* List of created channels */}
                  {addedChannels.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-micro font-bold text-[var(--text-subtle)] uppercase tracking-wider">Ваши ссылки для рекламы</h4>
                      <div className="max-h-[120px] overflow-y-auto border border-[var(--ds-border)] rounded-2xl divide-y divide-[var(--ds-border)] bg-[var(--ds-surface)] shadow-sm animate-fade-in">
                        {addedChannels.map((c, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 hover:bg-[var(--surface-2)] transition-colors">
                            <div className="min-w-0 flex-1 pr-3">
                              <p className="text-caption font-bold text-[var(--text)]">{c.name}</p>
                              <p className="text-micro text-[var(--ds-primary)] truncate mt-0.5">{c.link}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(c.link)}
                              className="p-2 bg-[var(--surface-2)] border border-[var(--ds-border)] rounded-xl hover:bg-[var(--surface-2)] text-[var(--text-secondary)] shrink-0 transition-colors"
                            >
                              {copiedLink === c.link ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer Actions */}
                  <div className="flex justify-end pt-4 border-t border-[var(--ds-border)] shrink-0">
                    <button
                      type="button"
                      onClick={() => setCurrentStep("tracking")}
                      className="w-full sm:w-auto px-6 py-3 dash-btn-dark px-6 py-3 text-body flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                      Продолжить к трекингу сотрудников
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* --- STEP 4: TRACKING & TELEGRAM BOT --- */}
              {currentStep === "tracking" && (
                <motion.div
                  key="tracking-step"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="space-y-4 sm:space-y-5"
                >
                  <div className="text-center max-w-md mx-auto">
                    <h2 className="text-base sm:text-lg font-black text-[var(--text)]">Геолокация филиалов и Telegram-трекинг</h2>
                    <p className="text-caption text-[var(--text-secondary)] mt-1">
                      Настройте филиалы клиники для учета рабочего времени сотрудников по приходу и подключите свой Telegram.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Geofencing branch settings */}
                    <div className="dash-form-card space-y-3">
                      <div className="flex items-center gap-1.5 text-caption font-bold text-[var(--text)]">
                        <MapPin className="w-4 h-4 text-[var(--ds-primary)]" />
                        <span>Добавить филиал</span>
                      </div>
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={branchName}
                          onChange={e => setBranchName(e.target.value)}
                          placeholder="Название филиала (Алматы, Достык)"
                          className="w-full border border-[var(--ds-border)] rounded-xl px-3 py-2.5 text-caption bg-[var(--ds-surface)] focus:outline-none focus:border-[var(--ds-primary)]"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-micro text-[var(--text-subtle)] font-bold block mb-0.5">Широта</span>
                            <input
                              type="text"
                              value={branchLat}
                              onChange={e => setBranchLat(e.target.value)}
                              placeholder="43.2389"
                              className="w-full border border-[var(--ds-border)] rounded-xl px-2.5 py-2 text-micro bg-[var(--ds-surface)] focus:outline-none"
                            />
                          </div>
                          <div>
                            <span className="text-micro text-[var(--text-subtle)] font-bold block mb-0.5">Долгота</span>
                            <input
                              type="text"
                              value={branchLon}
                              onChange={e => setBranchLon(e.target.value)}
                              placeholder="76.8897"
                              className="w-full border border-[var(--ds-border)] rounded-xl px-2.5 py-2 text-micro bg-[var(--ds-surface)] focus:outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <span className="text-micro text-[var(--text-subtle)] font-bold block mb-0.5">Радиус зоны прихода (в метрах)</span>
                          <input
                            type="number"
                            value={branchRadius}
                            onChange={e => setBranchRadius(e.target.value)}
                            placeholder="100"
                            className="w-full border border-[var(--ds-border)] rounded-xl px-3 py-2 text-caption bg-[var(--ds-surface)] focus:outline-none"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={handleAddBranch}
                          className="w-full py-2 dash-btn-dark transition-colors"
                        >
                          Добавить филиал
                        </button>
                      </div>
                    </div>

                    {/* Telegram Integration Panel */}
                    <div className="dash-form-card flex flex-col justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-caption font-bold text-[var(--text)]">Telegram-уведомления</span>
                          {tgPlatformChatId && (
                            <span className="text-micro font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                              Подключен
                            </span>
                          )}
                        </div>
                        <p className="text-micro text-[var(--text-subtle)] leading-relaxed">
                          Подключите наш Telegram-бот, чтобы моментально получать уведомления, когда сотрудники отмечают приход/уход на работе.
                        </p>
                      </div>

                      {tgPlatformChatId ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-emerald-800 text-micro sm:text-micro">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Telegram успешно подключён!</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleConnectTelegram}
                          disabled={connectingTg}
                          className="w-full py-3 bg-[#229ED9] hover:bg-[#1d82b3] disabled:opacity-50 text-white rounded-xl text-caption font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm mt-auto animate-pulse-slow"
                        >
                          {connectingTg ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Подключаем...</>
                          ) : (
                            <><ExternalLink className="w-3.5 h-3.5" /> Подключить Telegram бот</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Added branches preview */}
                  {addedBranches.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-micro font-bold text-[var(--text-subtle)] uppercase tracking-wider">Ваши филиалы ({addedBranches.length})</h4>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {addedBranches.map((b, idx) => (
                          <div key={idx} className="bg-[var(--surface-2)] border border-[var(--ds-border)]/80 rounded-xl px-3 py-2 flex items-center gap-1.5 text-caption text-[var(--text)] shrink-0 shadow-sm">
                            <MapPin className="w-3.5 h-3.5 text-[var(--ds-primary)]" />
                            <span className="font-bold">{b.name}</span>
                            <span className="text-micro text-[var(--text-subtle)]">({b.radius}м)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer Actions */}
                  <div className="flex justify-end pt-4 border-t border-[var(--ds-border)] shrink-0">
                    <button
                      type="button"
                      onClick={handleCompleteOnboarding}
                      className="w-full sm:w-auto px-6 py-3 bg-[var(--ds-primary)] hover:bg-[#0053d6] text-white rounded-xl text-body font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                      Завершить первоначальную настройку
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* --- COMPLETED SCREEN --- */}
              {currentStep === "completed" && (
                <motion.div
                  key="completed-screen"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-10 text-center space-y-6 flex flex-col items-center justify-center"
                >
                  <div className="w-20 h-20 bg-emerald-50 border border-emerald-200 rounded-3xl flex items-center justify-center text-emerald-500 shadow-lg relative">
                    <CheckCircle2 className="w-10 h-10" />
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-[var(--ds-primary)] text-white rounded-full flex items-center justify-center"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </motion.div>
                  </div>

                  <div className="max-w-md space-y-2 px-4">
                    <h2 className="text-xl sm:text-2xl font-black text-[var(--text)]">Первоначальная настройка завершена!</h2>
                    <p className="text-caption sm:text-caption text-[var(--text-secondary)] leading-relaxed">
                      Поздравляем! Вы добавили сотрудников, настроили и обучили ИИ чат-бота, создали рекламные ссылки для сквозной аналитики и подключили филиалы и Telegram-бота.
                    </p>
                    <p className="text-micro sm:text-xs text-[var(--ds-primary)] font-bold">
                      Теперь клиника полностью готова к работе в системе 1Dent!
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full sm:w-auto px-8 py-3.5 dash-btn-dark shadow-md transition-colors animate-bounce"
                  >
                    Перейти в панель управления
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

const DENTAL_SPECIALTIES = [
  "Терапевт",
  "Ортодонт",
  "Хирург",
  "Имплантолог",
  "Ортопед",
  "Пародонтолог",
  "Эндодонтист",
  "Детский стоматолог",
  "Рентгенолог",
  "Стоматолог общей практики",
  "Гигиенист",
  "Анестезиолог",
];

function SpecialtyTagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = DENTAL_SPECIALTIES.filter(
    (s) => !values.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase()),
  );
  const customNotInList =
    inputValue.trim() !== "" &&
    !DENTAL_SPECIALTIES.some((s) => s.toLowerCase() === inputValue.trim().toLowerCase()) &&
    !values.includes(inputValue.trim());

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInputValue("");
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(values.filter((v) => v !== tag));
  };

  return (
    <div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 animate-fade-in">
          {values.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-caption font-semibold"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-emerald-500 hover:text-emerald-700 ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          placeholder={placeholder ?? "Введите или выберите..."}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              if (inputValue.trim()) addTag(inputValue.trim());
            }
            if (e.key === " " || e.key === "Spacebar") {
              const val = inputValue.trim();
              if (val) {
                e.preventDefault();
                addTag(val);
              }
            }
            if (e.key === "Escape") setIsOpen(false);
          }}
          className="w-full border border-[var(--ds-border)] rounded-xl px-3.5 py-2.5 text-body bg-[var(--ds-surface)] focus:outline-none focus:border-[var(--ds-primary)] focus:ring-4 focus:ring-[var(--ds-primary)]/10 transition-all duration-200"
        />
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsOpen((o) => !o);
            inputRef.current?.focus();
          }}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {isOpen && (filtered.length > 0 || customNotInList) && (
          <div className="absolute top-full mt-1 left-0 right-0 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-xl shadow-lg z-20 max-h-52 overflow-y-auto">
            {filtered.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={() => addTag(s)}
                className="w-full text-left px-4 py-2.5 text-body text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
              >
                {s}
              </button>
            ))}
            {customNotInList && (
              <button
                type="button"
                onMouseDown={() => addTag(inputValue.trim())}
                className="w-full text-left px-4 py-2.5 text-body font-semibold border-t border-[var(--ds-border)] hover:bg-[var(--bg)] transition-colors text-[var(--ds-primary)]"
              >
                + Добавить «{inputValue.trim()}»
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

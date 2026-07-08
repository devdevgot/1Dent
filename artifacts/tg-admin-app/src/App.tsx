import { useEffect, useState, createContext, useContext } from "react";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import WebApp from "@twa-dev/sdk";
import { AlertTriangle, Lock } from "lucide-react";
import { api, setInitData, type TmaUser } from "./lib/api";
import BottomNav from "./components/BottomNav";
import Dashboard from "./pages/Dashboard";
import ClinicsPage from "./pages/ClinicsPage";
import ClinicDetailPage from "./pages/ClinicDetailPage";
import ClinicPickerPage from "./pages/ClinicPickerPage";
import ActivityPage from "./pages/ActivityPage";
import PlanRequestsPage from "./pages/PlanRequestsPage";
import LogsPage from "./pages/LogsPage";
import ErrorsPage from "./pages/ErrorsPage";
import SettingsPage from "./pages/SettingsPage";
import TabletVideosPage from "./pages/TabletVideosPage";
import ContentHubPage from "./pages/ContentHubPage";
import PlatformPlansPage from "./pages/PlatformPlansPage";
import PlatformContractsPage from "./pages/PlatformContractsPage";
import PlatformChatbotPage from "./pages/PlatformChatbotPage";
import PlatformWhatsappPage from "./pages/PlatformWhatsappPage";
import MorePage from "./pages/MorePage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

interface AppCtx {
  user: TmaUser | null;
}
export const AppContext = createContext<AppCtx>({ user: null });
export const useApp = () => useContext(AppContext);

function BottomNavWrapper() {
  const location = useLocation();
  const hideNav =
    (location.pathname.startsWith("/clinics/") && location.pathname.length > "/clinics/".length) ||
    location.pathname.startsWith("/picker/") ||
    ["/activity", "/settings", "/errors", "/logs", "/platform", "/tablet"].some((p) =>
      location.pathname.startsWith(p),
    );
  if (hideNav) return null;
  return <BottomNav />;
}

function Inner() {
  const [initDataReady, setInitDataReady] = useState(false);

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
      const d = WebApp.initData;
      setInitData(d || "dev");
    } catch {
      setInitData("dev");
    }
    setInitDataReady(true);
  }, []);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tma-me"],
    queryFn: () => api.get<{ success: boolean; data: { user: TmaUser } }>("/me"),
    enabled: initDataReady,
  });

  if (!initDataReady || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : "Ошибка";
    const isAccess = msg.toLowerCase().includes("access") || msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("401");
    return (
      <div className="flex items-center justify-center min-h-screen bg-background px-6">
        <div className="text-center space-y-4 max-w-xs">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            {isAccess ? <Lock className="w-8 h-8 text-destructive" /> : <AlertTriangle className="w-8 h-8 text-destructive" />}
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {isAccess ? "Доступ запрещён" : "Ошибка"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isAccess ? "Вы не являетесь администратором платформы." : msg}
          </p>
        </div>
      </div>
    );
  }

  const user = data?.data?.user ?? null;

  return (
    <AppContext.Provider value={{ user }}>
      <div className="flex flex-col min-h-screen bg-background">
        <main className="flex-1 overflow-auto pb-20">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clinics" element={<ClinicsPage />} />
            <Route path="/clinics/:clinicId" element={<ClinicDetailPage />} />

            {/* Section-first clinic pickers */}
            <Route path="/picker/sessions" element={<ClinicPickerPage title="Сессии" icon="sessions" tab="sessions" />} />
            <Route path="/picker/messages" element={<ClinicPickerPage title="Сообщения" icon="messages" tab="messages" />} />
            <Route path="/picker/patients" element={<ClinicPickerPage title="Пациенты" icon="patients" tab="patients" />} />
            <Route path="/picker/analytics" element={<ClinicPickerPage title="Аналитика" icon="analytics" tab="analytics" />} />
            <Route path="/picker/broadcasts" element={<ClinicPickerPage title="Рассылки" icon="broadcasts" tab="broadcasts" />} />
            <Route path="/picker/contracts" element={<ClinicPickerPage title="Договоры" icon="contracts" tab="contracts" />} />
            <Route path="/picker/inventory" element={<ClinicPickerPage title="Инвентарь" icon="inventory" tab="inventory" />} />
            <Route path="/picker/finances" element={<ClinicPickerPage title="Финансы" icon="finances" tab="finances" />} />
            <Route path="/picker/users" element={<ClinicPickerPage title="Сотрудники" icon="users" tab="users" />} />
            <Route path="/picker/chatbot" element={<ClinicPickerPage title="Чатбот" icon="chatbot" tab="chatbot" />} />
            <Route path="/picker/channels" element={<ClinicPickerPage title="Каналы" icon="channels" tab="channels" />} />
            <Route path="/picker/procedures" element={<ClinicPickerPage title="Прайс-лист" icon="procedures" tab="procedures" />} />
            <Route path="/picker/knowledge" element={<ClinicPickerPage title="База знаний" icon="knowledge" tab="knowledge" />} />
            <Route path="/picker/notifications" element={<ClinicPickerPage title="Уведомления" icon="notifications" tab="notifications" />} />
            <Route path="/picker/files" element={<ClinicPickerPage title="Файлы" icon="files" tab="files" />} />

            <Route path="/plan-requests" element={<PlanRequestsPage />} />
            <Route path="/content" element={<ContentHubPage />} />
            <Route path="/tablet" element={<TabletVideosPage />} />
            <Route path="/platform/plans" element={<PlatformPlansPage />} />
            <Route path="/platform/contracts" element={<PlatformContractsPage />} />
            <Route path="/platform/chatbot" element={<PlatformChatbotPage />} />
            <Route path="/platform/whatsapp" element={<PlatformWhatsappPage />} />
            <Route path="/more" element={<MorePage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/errors" element={<ErrorsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <BottomNavWrapper />
      </div>
    </AppContext.Provider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Inner />
      </HashRouter>
    </QueryClientProvider>
  );
}

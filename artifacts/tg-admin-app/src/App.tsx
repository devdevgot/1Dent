import { useState, useEffect, createContext, useContext } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import WebApp from "@twa-dev/sdk";
import { api, setInitData, type TmaUser } from "./lib/api";
import BottomNav from "./components/BottomNav";
import Dashboard from "./pages/Dashboard";
import Clinics from "./pages/Clinics";
import Activity from "./pages/Activity";
import Logs from "./pages/Logs";
import Settings from "./pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

type Tab = "dashboard" | "clinics" | "activity" | "logs" | "settings";

interface AppCtx {
  user: TmaUser | null;
  tab: Tab;
  setTab: (t: Tab) => void;
}

export const AppContext = createContext<AppCtx>({ user: null, tab: "dashboard", setTab: () => {} });
export const useApp = () => useContext(AppContext);

function Inner() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [initDataReady, setInitDataReady] = useState(false);

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
      const initData = WebApp.initData;
      if (initData) {
        setInitData(initData);
      } else {
        // Dev mode fallback
        setInitData("dev");
      }
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
    const isAccess = msg.toLowerCase().includes("access") || msg.toLowerCase().includes("denied");
    return (
      <div className="flex items-center justify-center min-h-screen bg-background px-6">
        <div className="text-center space-y-4 max-w-xs">
          <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mx-auto text-3xl">
            {isAccess ? "🔒" : "⚠️"}
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {isAccess ? "Доступ запрещён" : "Ошибка"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isAccess
              ? "Вы не являетесь администратором платформы. Обратитесь к суперадминистратору."
              : msg}
          </p>
        </div>
      </div>
    );
  }

  const user = data?.data?.user ?? null;

  const pages: Record<Tab, JSX.Element> = {
    dashboard: <Dashboard />,
    clinics: <Clinics />,
    activity: <Activity />,
    logs: <Logs />,
    settings: <Settings />,
  };

  return (
    <AppContext.Provider value={{ user, tab, setTab }}>
      <div className="flex flex-col min-h-screen bg-background">
        <main className="flex-1 overflow-auto pb-20">
          {pages[tab]}
        </main>
        <BottomNav tab={tab} setTab={setTab} />
      </div>
    </AppContext.Provider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Inner />
    </QueryClientProvider>
  );
}

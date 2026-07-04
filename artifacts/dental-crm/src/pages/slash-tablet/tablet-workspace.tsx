import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { useAuthStore } from "@/hooks/use-auth";
import { clearAuthToken } from "@/lib/auth-token";
import { useLogout } from "@workspace/api-client-react";
import { TabletLayout } from "./tablet-layout";
import { PatientList } from "./patient-list";
import { PatientCard } from "./patient-card";
import {
  TabletSchedulePage,
  TabletChatPage,
  TabletAnalyticsPage,
  TabletPayrollPage,
  TabletServicesPage,
  TabletContractsPage,
  TabletMenuPage,
} from "./tablet-pages";
import { resolveTabletSession, clearCabinetSession, type TabletSession } from "./tablet-session";
import { PATIENTS, type TabletPatient } from "./mock-data";

export default function TabletWorkspace() {
  const { user, clearAuth } = useAuthStore();
  const [, navigate] = useLocation();
  const [session, setSession] = useState<TabletSession | null>(() => resolveTabletSession(user));
  const [selectedPatient, setSelectedPatient] = useState<TabletPatient | null>(null);

  useEffect(() => {
    setSession(resolveTabletSession(user));
  }, [user]);

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        clearAuthToken();
        clearAuth();
        clearCabinetSession();
        navigate("/tablet");
      },
    },
  });

  useEffect(() => {
    if (!session) navigate("/tablet");
  }, [session, navigate]);

  const handleLogout = () => {
    if (session?.mode === "crm" && user) {
      logoutMutation.mutate();
      return;
    }
    clearCabinetSession();
    navigate("/tablet");
  };

  if (!session) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#faf8f4]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1f75fe]/20 border-t-[#1f75fe]" />
      </div>
    );
  }

  if (selectedPatient) {
    return (
      <PatientCard
        patient={selectedPatient}
        session={session}
        onBack={() => setSelectedPatient(null)}
      />
    );
  }

  return (
    <TabletLayout session={session} onLogout={handleLogout}>
      <Switch>
        <Route path="/tablet/workspace/patients">
          <PatientList onSelect={setSelectedPatient} showCreate />
        </Route>
        <Route path="/tablet/workspace/schedule">
          <TabletSchedulePage onSelectPatient={(id) => {
            const p = PATIENTS.find((x) => x.id === id);
            if (p) setSelectedPatient(p);
          }} />
        </Route>
        <Route path="/tablet/workspace/chat">
          <TabletChatPage />
        </Route>
        <Route path="/tablet/workspace/analytics">
          <TabletAnalyticsPage role={session.role} />
        </Route>
        <Route path="/tablet/workspace/payroll">
          <TabletPayrollPage role={session.role} />
        </Route>
        <Route path="/tablet/workspace/services">
          <TabletServicesPage />
        </Route>
        <Route path="/tablet/workspace/contracts">
          <TabletContractsPage />
        </Route>
        <Route path="/tablet/workspace/menu">
          <TabletMenuPage session={session} onLogout={handleLogout} />
        </Route>
        <Route>
          <PatientList onSelect={setSelectedPatient} showCreate />
        </Route>
      </Switch>
    </TabletLayout>
  );
}

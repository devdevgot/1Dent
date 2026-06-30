import { useLocation } from "wouter";
import { BranchesSettings } from "@/components/settings/branches-settings";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";

export default function BranchesPage() {
  const [, setLocation] = useLocation();

  return (
    <PageShell className="pb-10">
      <PageHeader
        title="Трекинг"
        onBack={() => setLocation("/menu")}
      />
      <div className="px-4 py-5">
        <BranchesSettings />
      </div>
    </PageShell>
  );
}

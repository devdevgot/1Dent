import { BranchesSettings } from "@/components/settings/branches-settings";
import { usePageBack } from "@/hooks/use-page-back";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";

export default function BranchesPage() {
  const goBack = usePageBack({ menuFallback: true });

  return (
    <PageShell className="pb-10">
      <PageHeader
        title="Трекинг"
        onBack={goBack}
      />
      <div className="px-4 py-5">
        <BranchesSettings />
      </div>
    </PageShell>
  );
}

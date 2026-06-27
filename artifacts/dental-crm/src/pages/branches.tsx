import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { BranchesSettings } from "@/components/settings/branches-settings";

export default function BranchesPage() {
  return (
    <div className="min-h-screen bg-[#faf8f4] font-manrope pb-10">
      <div className="sticky top-0 z-10 bg-white border-b border-[#e8e3d9] flex items-center gap-3 px-4 py-3">
        <Link href="/menu" className="p-1.5 -ml-1.5 rounded-xl active:bg-[#f1ede4] hover:bg-[#f1ede4] transition-colors text-[#64748b]">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-[17px] font-semibold text-[#0f172a]">Трекинг</h1>
      </div>
      <div className="px-4 py-5">
        <BranchesSettings />
      </div>
    </div>
  );
}

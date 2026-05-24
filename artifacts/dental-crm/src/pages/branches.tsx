import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { BranchesSettings } from "@/components/settings/branches-settings";

export default function BranchesPage() {
  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 flex items-center gap-3 px-4 py-3">
        <Link href="/menu" className="p-1.5 -ml-1.5 rounded-xl active:bg-gray-100 transition-colors">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <h1 className="text-[17px] font-semibold text-gray-900">Филиалы и геозоны</h1>
      </div>
      <div className="px-4 py-5">
        <BranchesSettings />
      </div>
    </div>
  );
}

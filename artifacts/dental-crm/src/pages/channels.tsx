import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ChevronLeft, Radio } from "lucide-react";
import { ChannelsSettings } from "@/components/channels/channels-settings";

export default function ChannelsPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-full bg-[#f2f2f7] pb-8">
      <div className="bg-white px-4 pt-5 pb-4 mb-4 flex items-center gap-3 border-b border-gray-100">
        <Link href="/menu" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" strokeWidth={1.8} />
          <h1 className="text-[17px] font-semibold text-gray-900">
            {t("channels.sectionTitle", { defaultValue: "Каналы привлечения" })}
          </h1>
        </div>
      </div>

      <div className="px-4">
        <ChannelsSettings />
      </div>
    </div>
  );
}

import { MapPin, BellRing } from "lucide-react";
import { PagePreviewFrame } from "./page-preview-frame";

export function EmployeeTrackingMockup() {
  return (
    <PagePreviewFrame title="Трекинг сотрудников">
      <div className="p-4 bg-[#faf8f4] min-h-[240px] space-y-3">
        {/* Map with geofence radius */}
        <div className="relative w-full h-[168px] rounded-xl overflow-hidden border border-[#e8e3d9] bg-[#eef3ef]">
          {/* Roads / grid */}
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 168" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <rect width="300" height="168" fill="#e8efe8" />
            <path d="M0 60 H300 M0 120 H300 M70 0 V168 M200 0 V168" stroke="#d5e0d5" strokeWidth="10" />
            <path d="M0 60 H300 M0 120 H300 M70 0 V168 M200 0 V168" stroke="#f4f8f4" strokeWidth="2" strokeDasharray="6 6" />
            {/* Green blocks */}
            <rect x="14" y="14" width="40" height="30" rx="4" fill="#d3e6d0" />
            <rect x="230" y="128" width="52" height="26" rx="4" fill="#d3e6d0" />

            {/* Geofence radius around clinic */}
            <circle cx="150" cy="84" r="60" fill="#1f75fe" fillOpacity="0.12" stroke="#1f75fe" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="5 4" />
          </svg>

          {/* Clinic pin (center) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
            <div className="flex flex-col items-center">
              <div className="w-7 h-7 rounded-full bg-[#1f75fe] flex items-center justify-center shadow-md ring-2 ring-white">
                <MapPin size={14} className="text-white" />
              </div>
            </div>
          </div>

          {/* Employee inside radius */}
          <div className="absolute" style={{ left: "40%", top: "62%" }}>
            <span className="block w-3 h-3 rounded-full bg-green-500 ring-2 ring-white shadow" />
          </div>

          {/* Employee outside radius */}
          <div className="absolute" style={{ left: "83%", top: "22%" }}>
            <span className="relative block w-3 h-3 rounded-full bg-red-500 ring-2 ring-white shadow">
              <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
            </span>
          </div>

          {/* Radius label */}
          <span className="absolute left-2 bottom-2 text-[9px] font-semibold text-[#1f75fe] bg-white/85 rounded-md px-1.5 py-0.5">
            Радиус 300 м
          </span>
        </div>

        {/* Alert notification */}
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
          <span className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shrink-0">
            <BellRing size={12} className="text-white" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[#b91c1c] leading-tight truncate">
              Данияр К. вышел из зоны клиники
            </p>
            <p className="text-[9px] text-[#ef4444] leading-tight">Сегодня, 14:12</p>
          </div>
        </div>
      </div>
    </PagePreviewFrame>
  );
}

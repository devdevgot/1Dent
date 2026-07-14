import { cn } from "@/lib/utils";
import { WA_ICON_PATH } from "@/components/whatsapp/whatsapp-connect-modal";

export const TAB_ACTIVE = "#22c55e";
export const TAB_INACTIVE = "#94a3b8";

type TabIconProps = {
  active?: boolean;
  className?: string;
};

function TabIconShell({
  active,
  className,
  children,
  highlightId,
  viewBox = "0 0 24 24",
}: TabIconProps & {
  children: (gradId: string) => React.ReactNode;
  highlightId: string;
  viewBox?: string;
}) {
  const color = active ? TAB_ACTIVE : TAB_INACTIVE;
  const gradId = `${highlightId}-${active ? "on" : "off"}`;
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-6 h-6", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity={active ? 0.38 : 0.22} />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fill={color}>{children(gradId)}</g>
    </svg>
  );
}

export function TabHomeIcon(props: TabIconProps) {
  return (
    <TabIconShell {...props} highlightId="tab-home">
      {(gradId) => (
        <>
          <path d="M12 4.2 5 10.1v9.2c0 .55.45 1 1 1h4.5v-5.5h3V20.3H18c.55 0 1-.45 1-1v-9.2L12 4.2Z" />
          <path
            d="M12 4.2 5 10.1v9.2c0 .55.45 1 1 1h4.5v-5.5h3V20.3H18c.55 0 1-.45 1-1v-9.2L12 4.2Z"
            fill={`url(#${gradId})`}
          />
        </>
      )}
    </TabIconShell>
  );
}

export function TabCalendarIcon({ active, ...props }: TabIconProps) {
  const bodyPath =
    "M5.75 8.5h12.5A1.75 1.75 0 0 1 20 10.25v9.5A1.75 1.75 0 0 1 18.25 21.5H5.75A1.75 1.75 0 0 1 4 19.75v-9.5A1.75 1.75 0 0 1 5.75 8.5Z";

  return (
    <TabIconShell active={active} {...props} highlightId="tab-calendar">
      {(gradId) => (
        <>
          <rect x="7.5" y="4.75" width="2" height="4.25" rx="1" />
          <rect x="14.5" y="4.75" width="2" height="4.25" rx="1" />
          <path d={bodyPath} />
          <path
            d="M5.75 8.5h12.5v3.25H5.75V8.5Z"
            fill="white"
            fillOpacity={active ? 0.72 : 0.52}
          />
          <circle cx="9" cy="15.25" r="1.25" fill="white" fillOpacity={active ? 0.85 : 0.65} />
          <circle cx="12" cy="15.25" r="1.25" fill="white" fillOpacity={active ? 0.55 : 0.4} />
          <circle cx="15" cy="15.25" r="1.25" fill="white" fillOpacity={active ? 0.55 : 0.4} />
          <path d={bodyPath} fill={`url(#${gradId})`} />
        </>
      )}
    </TabIconShell>
  );
}

export function TabPatientsIcon(props: TabIconProps) {
  return (
    <TabIconShell {...props} highlightId="tab-patients">
      {(gradId) => (
        <>
          <circle cx="9.25" cy="9.25" r="2.75" />
          <path d="M5.25 17.75c0-2.21 1.79-3.5 4-3.5s4 1.29 4 3.5v.75H5.25v-.75Z" />
          <circle cx="16.25" cy="10" r="2.25" />
          <path d="M13.75 17.75c.18-1.72 1.45-2.75 3.25-2.75 1.1 0 2.02.45 2.58 1.2.38.5.58 1.12.58 1.8v.5h-6.41v-.75Z" />
          <path
            d="M9.25 6.5a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5Zm7 1.5a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Z"
            fill={`url(#${gradId})`}
          />
        </>
      )}
    </TabIconShell>
  );
}

export function TabFinanceIcon(props: TabIconProps) {
  return (
    <TabIconShell {...props} highlightId="tab-finance">
      {(gradId) => (
        <>
          <path d="M6 8.25h12a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7.5a2 2 0 0 1 2-2Z" />
          <path d="M6 11.25h12v1.5H6v-1.5Z" fill="white" fillOpacity={props.active ? 0.75 : 0.55} />
          <circle cx="15.25" cy="15.25" r="1.5" fill="white" fillOpacity={props.active ? 0.85 : 0.65} />
          <path
            d="M6 8.25h12a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7.5a2 2 0 0 1 2-2Z"
            fill={`url(#${gradId})`}
          />
        </>
      )}
    </TabIconShell>
  );
}

export function TabInventoryIcon(props: TabIconProps) {
  return (
    <TabIconShell {...props} highlightId="tab-inventory">
      {(gradId) => (
        <>
          <path d="M12 4.75 5.5 8.25v8.5L12 20.25l6.5-3.5v-8.5L12 4.75Z" />
          <path d="M12 11.25v8.5" fill="white" fillOpacity={props.active ? 0.55 : 0.4} />
          <path d="M8.75 9.75 12 11.25l3.25-1.5" fill="none" stroke="white" strokeWidth="1.25" strokeLinecap="round" strokeOpacity={props.active ? 0.75 : 0.55} />
          <path
            d="M12 4.75 5.5 8.25v8.5L12 20.25l6.5-3.5v-8.5L12 4.75Z"
            fill={`url(#${gradId})`}
          />
        </>
      )}
    </TabIconShell>
  );
}

export function TabServicesIcon(props: TabIconProps) {
  return (
    <TabIconShell {...props} highlightId="tab-services">
      {(gradId) => (
        <>
          <rect x="4" y="4" width="7" height="7" rx="2" />
          <rect x="13" y="4" width="7" height="7" rx="2" />
          <rect x="4" y="13" width="7" height="7" rx="2" />
          <rect x="13" y="13" width="7" height="7" rx="2" />
          <rect x="4" y="4" width="7" height="7" rx="2" fill={`url(#${gradId})`} />
          <rect x="13" y="4" width="7" height="7" rx="2" fill={`url(#${gradId})`} />
          <rect x="4" y="13" width="7" height="7" rx="2" fill={`url(#${gradId})`} />
          <rect x="13" y="13" width="7" height="7" rx="2" fill={`url(#${gradId})`} />
        </>
      )}
    </TabIconShell>
  );
}

export function TabWhatsAppIcon(props: TabIconProps) {
  return (
    <TabIconShell {...props} highlightId="tab-whatsapp">
      {(gradId) => (
        <g transform="translate(12 12) scale(0.72) translate(-12 -12)">
          <path d={WA_ICON_PATH} />
          <path d={WA_ICON_PATH} fill={`url(#${gradId})`} />
        </g>
      )}
    </TabIconShell>
  );
}

/** @deprecated Use TabWhatsAppIcon */
export const TabMessagesIcon = TabWhatsAppIcon;

export function TabProfileIcon(props: TabIconProps) {
  return (
    <TabIconShell {...props} highlightId="tab-profile">
      {(gradId) => (
        <>
          <circle cx="12" cy="8.75" r="3.25" />
          <path d="M6.25 18.75c0-3.18 2.58-4.75 5.75-4.75s5.75 1.57 5.75 4.75v.75H6.25v-.75Z" />
          <circle cx="12" cy="8.75" r="3.25" fill={`url(#${gradId})`} />
        </>
      )}
    </TabIconShell>
  );
}

/** @deprecated Use TabProfileIcon */
export const TabMoreIcon = TabProfileIcon;

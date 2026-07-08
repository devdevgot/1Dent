import { cn } from "@/lib/utils";

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

export function TabCalendarIcon(props: TabIconProps) {
  return (
    <TabIconShell {...props} highlightId="tab-calendar">
      {(gradId) => (
        <>
          <rect x="5.25" y="7" width="13.5" height="12.25" rx="2.25" />
          <rect x="7.75" y="4.75" width="2" height="3.75" rx="1" />
          <rect x="14.25" y="4.75" width="2" height="3.75" rx="1" />
          <rect x="5.25" y="10.25" width="13.5" height="1.75" fill="white" fillOpacity={props.active ? 0.7 : 0.5} />
          <rect x="8" y="13" width="2.25" height="2.25" rx=".5" fill="white" fillOpacity={props.active ? 0.85 : 0.65} />
          <rect x="11.875" y="13" width="2.25" height="2.25" rx=".5" fill="white" fillOpacity={props.active ? 0.55 : 0.4} />
          <rect x="15.75" y="13" width="2.25" height="2.25" rx=".5" fill="white" fillOpacity={props.active ? 0.55 : 0.4} />
          <rect
            x="5.25"
            y="7"
            width="13.5"
            height="12.25"
            rx="2.25"
            fill={`url(#${gradId})`}
          />
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

export function TabMessagesIcon(props: TabIconProps) {
  return (
    <TabIconShell {...props} highlightId="tab-messages">
      {(gradId) => (
        <>
          <path d="M6 5.75h12c.97 0 1.75.78 1.75 1.75v6.5c0 .97-.78 1.75-1.75 1.75H11l-3.2 2.4c-.55.41-1.3-.02-1.3-.7V16.5H6A1.75 1.75 0 0 1 4.25 14.75v-6.5C4.25 6.53 5.03 5.75 6 5.75Z" />
          <rect x="9" y="10.5" width="6" height="1.5" rx=".75" fill="white" fillOpacity={props.active ? 0.85 : 0.65} />
          <path
            d="M6 5.75h12c.97 0 1.75.78 1.75 1.75v6.5c0 .97-.78 1.75-1.75 1.75H11l-3.2 2.4c-.55.41-1.3-.02-1.3-.7V16.5H6A1.75 1.75 0 0 1 4.25 14.75v-6.5C4.25 6.53 5.03 5.75 6 5.75Z"
            fill={`url(#${gradId})`}
          />
        </>
      )}
    </TabIconShell>
  );
}

export function TabMoreIcon(props: TabIconProps) {
  const color = props.active ? TAB_ACTIVE : TAB_INACTIVE;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-6 h-6", props.className)}
      aria-hidden
    >
      <circle cx="6" cy="12" r="2.25" fill={color} />
      <circle cx="12" cy="12" r="2.25" fill={color} />
      <circle cx="18" cy="12" r="2.25" fill={color} />
    </svg>
  );
}

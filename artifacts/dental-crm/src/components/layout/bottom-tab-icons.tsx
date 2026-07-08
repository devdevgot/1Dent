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
}: TabIconProps & { children: React.ReactNode; highlightId: string; viewBox?: string }) {
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

export function TabOperationsIcon(props: TabIconProps) {
  return (
    <TabIconShell {...props} highlightId="tab-ops">
      {(gradId) => (
        <>
          <path d="M4.5 11.25h6.75V8.25L14.25 12 11.25 15.75V12.75H4.5v-1.5Z" />
          <path d="M19.5 12.75h-6.75v3L9.75 12l2.25-3.75v3h6.75v1.5Z" />
          <path
            d="M4.5 11.25h6.75V8.25L14.25 12 11.25 15.75V12.75H4.5v-1.5Zm15 1.5h-6.75v3L9.75 12l2.25-3.75v3h6.75v1.5Z"
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

import {
  Bone,
  FilterPillsSkeleton,
  SearchBarSkeleton,
  TableSkeleton,
  ListRowsSkeleton,
  KpiGridSkeleton,
  ChartCardSkeleton,
  FormSkeleton,
} from "./primitives";
import {
  PatientsTableSkeleton,
  ServicesTableSkeleton,
  ScheduleMonthSkeleton,
} from "./page-skeletons";

export type MenuServiceSkeletonVariant =
  | "default"
  | "patients"
  | "users"
  | "services"
  | "schedule"
  | "analytics"
  | "financials"
  | "inventory"
  | "chatbot"
  | "form"
  | "dashboard";

/** Content-only skeleton for service overlay (sheet already provides the header). */
export function MenuServiceContentSkeleton({
  variant = "default",
}: {
  variant?: MenuServiceSkeletonVariant;
}) {
  return (
    <div className="min-h-full bg-[#faf8f4] font-manrope animate-in-fade">
      {variant === "patients" && <PatientsOverlaySkeleton />}
      {variant === "users" && <UsersOverlaySkeleton />}
      {variant === "services" && <ServicesOverlaySkeleton />}
      {variant === "schedule" && <ScheduleOverlaySkeleton />}
      {variant === "analytics" && <AnalyticsOverlaySkeleton />}
      {variant === "financials" && <FinancialsOverlaySkeleton />}
      {variant === "inventory" && <InventoryOverlaySkeleton />}
      {variant === "chatbot" && <ChatbotOverlaySkeleton />}
      {variant === "form" && <FormOverlaySkeleton />}
      {variant === "dashboard" && <DashboardOverlaySkeleton />}
      {variant === "default" && <DefaultOverlaySkeleton />}
    </div>
  );
}

function PatientsOverlaySkeleton() {
  return (
    <div className="px-4 pt-3 space-y-3">
      <SearchBarSkeleton />
      <FilterPillsSkeleton count={2} />
      <PatientsTableSkeleton rows={8} />
    </div>
  );
}

function UsersOverlaySkeleton() {
  return (
    <div className="px-4 pt-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SearchBarSkeleton className="flex-1" />
        <Bone className="h-9 w-9 rounded-full shrink-0" />
        <Bone className="h-9 w-9 rounded-full shrink-0" />
      </div>
      <FilterPillsSkeleton count={5} />
      <ListRowsSkeleton rows={7} />
    </div>
  );
}

function ServicesOverlaySkeleton() {
  return (
    <div className="px-4 pt-3 space-y-3">
      <FilterPillsSkeleton count={6} />
      <SearchBarSkeleton />
      <ServicesTableSkeleton rows={7} />
    </div>
  );
}

function ScheduleOverlaySkeleton() {
  return (
    <div className="px-4 pt-3">
      <div className="flex items-center justify-end gap-2 mb-3">
        <Bone className="h-9 w-9 rounded-full" />
        <Bone className="h-9 w-9 rounded-full" />
        <Bone className="h-9 w-9 rounded-full" />
      </div>
      <ScheduleMonthSkeleton weeks={5} />
    </div>
  );
}

function AnalyticsOverlaySkeleton() {
  return (
    <div className="px-4 pt-3 space-y-4">
      <FilterPillsSkeleton count={4} />
      <KpiGridSkeleton count={4} />
      <ChartCardSkeleton height="h-56" />
      <ChartCardSkeleton height="h-44" />
    </div>
  );
}

function FinancialsOverlaySkeleton() {
  return (
    <div className="px-4 pt-3 space-y-4">
      <KpiGridSkeleton count={3} />
      <ChartCardSkeleton height="h-52" />
      <TableSkeleton rows={5} columns={4} avatar={false} />
    </div>
  );
}

function InventoryOverlaySkeleton() {
  return (
    <div className="px-4 pt-3 space-y-3">
      <SearchBarSkeleton />
      <ListRowsSkeleton rows={8} />
    </div>
  );
}

function ChatbotOverlaySkeleton() {
  return (
    <div className="px-4 pt-3 space-y-3">
      <FilterPillsSkeleton count={3} />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3 items-start">
            <Bone className="w-10 h-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <Bone className="h-3 w-28 rounded" />
              <Bone className="h-16 w-full rounded-2xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormOverlaySkeleton() {
  return (
    <div className="px-4 pt-4">
      <FormSkeleton fields={5} />
    </div>
  );
}

function DashboardOverlaySkeleton() {
  return (
    <div className="px-4 pt-3 space-y-4">
      <KpiGridSkeleton count={2} />
      <ListRowsSkeleton rows={5} />
    </div>
  );
}

function DefaultOverlaySkeleton() {
  return (
    <div className="px-4 pt-3 space-y-3">
      <SearchBarSkeleton />
      <TableSkeleton rows={7} columns={4} avatar={false} />
    </div>
  );
}

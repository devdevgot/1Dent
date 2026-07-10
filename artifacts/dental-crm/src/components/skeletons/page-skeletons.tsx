import { cn } from "@/lib/utils";
import {
  Bone,
  PageHeaderSkeleton,
  RootTabHeaderSkeleton,
  SkeletonCard,
  ChartCardSkeleton,
  TableSkeleton,
  ListRowsSkeleton,
  FormSkeleton,
  FilterPillsSkeleton,
} from "./primitives";

/**
 * Per-page skeletons. Each mirrors the real page layout so content appears
 * in place without shift. `XxxPageSkeleton` (with header silhouette) is used
 * as the route-level Suspense fallback in App.tsx; `XxxContentSkeleton`
 * variants are rendered inside pages while their data loads (the real
 * PageHeader is already visible there).
 */

/* ══════════════════════ Patients (/patients) ══════════════════════ */

/** Sortable patients table: # / avatar+name / phone / status / progress. */
export function PatientsTableSkeleton({ rows = 9 }: { rows?: number }) {
  return (
    <div className="w-full">
      <div className="bg-white border-b border-[var(--ds-border)] px-4 py-3 flex gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Bone key={i} className="h-3 flex-1 rounded" />
        ))}
      </div>
      <div className="divide-y divide-[var(--ds-border)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="bg-white px-4 py-3 flex items-center gap-3">
            <Bone className="h-3 w-5 rounded shrink-0" />
            <Bone className="w-9 h-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-4 w-36 max-w-full rounded" />
              <Bone className="h-3 w-24 rounded" />
            </div>
            <Bone className="h-5 w-20 rounded-full hidden sm:block" />
            <Bone className="h-2 w-24 rounded-full hidden md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PatientsHeaderBottomSkeleton() {
  return (
    <>
      <Bone className="h-9 w-full rounded-xl" />
      <Bone className="h-9 w-full rounded-xl mt-2.5" />
    </>
  );
}

export function PatientsPageSkeleton() {
  return (
    <div className="flex flex-col h-full min-h-screen bg-[var(--bg)] font-manrope">
      <PageHeaderSkeleton actions={3} bottom={<PatientsHeaderBottomSkeleton />} />
      <div className="flex-1 overflow-hidden">
        <PatientsTableSkeleton />
      </div>
    </div>
  );
}

/* ══════════════════════ Admin calendar (/calendar) ══════════════════════ */

/** 7×6 day-cell grid matching admin-calendar month body (inside its card). */
export function CalendarDaysGridSkeleton({ weeks = 6 }: { weeks?: number }) {
  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: weeks * 7 }).map((_, i) => (
        <div key={i} className="min-h-[80px] p-2 border-b border-r border-[var(--ds-border)]">
          <Bone className="w-7 h-7 rounded-full mb-1.5" />
          {i % 5 === 1 && <Bone className="h-4 w-full rounded" />}
          {i % 7 === 4 && <Bone className="h-4 w-3/4 rounded mt-1" />}
        </div>
      ))}
    </div>
  );
}

export function AdminCalendarPageSkeleton() {
  return (
    <div className="flex flex-col h-full min-h-screen bg-[var(--bg)] font-manrope overflow-hidden">
      <PageHeaderSkeleton back={false} actions={5} />
      <div className="flex-1 overflow-hidden p-3 sm:p-4 flex flex-col gap-2">
        <div className="flex-1 bg-white rounded-2xl shadow-md border border-[var(--ds-border)] overflow-hidden flex flex-col">
          <div className="flex-none grid grid-cols-7 border-b border-[var(--ds-border)]">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="py-2.5 flex justify-center">
                <Bone className="h-3 w-6 rounded" />
              </div>
            ))}
          </div>
          <div className="flex-1 overflow-hidden">
            <CalendarDaysGridSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════ Doctor schedule (/schedule) ══════════════════════ */

/** Full-bleed month rows matching doctor-schedule body (white bg, bordered cells). */
export function ScheduleMonthSkeleton({ weeks = 5 }: { weeks?: number }) {
  return (
    <div className="bg-white border-b border-[var(--ds-border)]">
      {Array.from({ length: weeks }).map((_, wi) => (
        <div key={wi} className="border-b border-[var(--ds-border)] grid grid-cols-7">
          {Array.from({ length: 7 }).map((_, di) => (
            <div key={di} className="min-h-[80px] border-r border-[var(--ds-border)] last:border-r-0 p-1.5">
              <div className="flex justify-center mb-1.5">
                <Bone className="w-7 h-7 rounded-full" />
              </div>
              {(wi * 7 + di) % 6 === 2 && <Bone className="h-4 w-full rounded" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function DoctorSchedulePageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-8">
      <PageHeaderSkeleton
        back={false}
        actions={3}
        bottom={
          <div className="grid grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex justify-center py-1">
                <Bone className="h-3 w-6 rounded" />
              </div>
            ))}
          </div>
        }
      />
      <ScheduleMonthSkeleton />
    </div>
  );
}

/* ═══════════════ Doctor schedule day (/schedule/:date) ═══════════════ */

/** Hour ruler + a few appointment blocks, matching the day timeline. */
export function DayTimelineContentSkeleton({ hours = 9 }: { hours?: number }) {
  return (
    <div className="p-4">
      {Array.from({ length: hours }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 h-16">
          <Bone className="h-3 w-10 rounded shrink-0" />
          <div className="flex-1 border-t border-[var(--ds-border)] pt-1.5">
            {(i === 1 || i === 5) && <Bone className="h-12 w-3/4 rounded-xl" />}
            {i === 3 && <Bone className="h-12 w-1/2 rounded-xl" />}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DoctorScheduleDayPageSkeleton() {
  return (
    <div className="flex flex-col h-full min-h-screen bg-[var(--bg)] font-manrope overflow-hidden">
      <PageHeaderSkeleton
        subtitle
        actions={1}
        bottom={
          <div className="flex items-center gap-2">
            <Bone className="w-9 h-9 rounded-full shrink-0" />
            <div className="flex-1 grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-1 py-1">
                  <Bone className="h-2.5 w-5 rounded" />
                  <Bone className="w-8 h-8 rounded-full" />
                </div>
              ))}
            </div>
            <Bone className="w-9 h-9 rounded-full shrink-0" />
          </div>
        }
      />
      <div className="flex-1 overflow-hidden">
        <DayTimelineContentSkeleton />
      </div>
    </div>
  );
}

/* ═══════════ New appointment (/admin/appointments/new) ═══════════ */

export function AppointmentFormSkeleton() {
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <SkeletonCard className="p-5">
        <Bone className="h-4 w-32 rounded mb-4" />
        <FormSkeleton fields={2} withButton={false} />
      </SkeletonCard>
      <SkeletonCard className="p-5">
        <Bone className="h-4 w-40 rounded mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bone key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </SkeletonCard>
      <SkeletonCard className="p-5">
        <Bone className="h-4 w-36 rounded mb-4" />
        <FormSkeleton fields={3} withButton={false} />
      </SkeletonCard>
      <Bone className="h-12 w-full rounded-xl" />
    </div>
  );
}

export function AppointmentNewPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope">
      <PageHeaderSkeleton />
      <AppointmentFormSkeleton />
    </div>
  );
}

/* ══════════════ Admin dashboard (/dashboard/admin) ══════════════ */

export function AdminScheduleListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-[var(--ds-border)]">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-3">
          <Bone className="h-4 w-12 rounded shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Bone className="h-4 w-40 max-w-full rounded" />
            <Bone className="h-3 w-28 rounded" />
          </div>
          <Bone className="h-5 w-20 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function AdminDashboardSkeleton() {
  return (
    <div className="dashboard-page min-h-full">
      <div className="dash-page-inner-lg dash-stack">
        <div className="dash-page-header">
          <div className="space-y-2">
            <Bone className="h-7 w-56 rounded-xl" />
            <Bone className="h-4 w-40 rounded" />
          </div>
          <Bone className="h-10 w-36 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard className="lg:col-span-2 p-5">
            <Bone className="h-4 w-44 rounded mb-5" />
            <AdminScheduleListSkeleton rows={6} />
          </SkeletonCard>
          <div className="space-y-4">
            <SkeletonCard className="p-4">
              <Bone className="h-4 w-24 rounded mb-4" />
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Bone key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            </SkeletonCard>
            <ChartCardSkeleton height="h-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bone key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════ Doctor analytics (/doctor-analytics) ══════════════ */

export function DoctorAnalyticsContentSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} className="p-3.5 flex flex-col gap-2">
            <Bone className="w-9 h-9 rounded-xl" />
            <Bone className="h-6 w-16 rounded" />
            <Bone className="h-3 w-24 rounded" />
          </SkeletonCard>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <ChartCardSkeleton key={i} height="h-[300px]" className="p-6" />
        ))}
      </div>
    </div>
  );
}

export function DoctorAnalyticsPageSkeleton() {
  return (
    <div className="h-full min-h-screen flex flex-col bg-[var(--bg)] font-manrope overflow-hidden">
      <PageHeaderSkeleton subtitle actions={1} />
      <div className="flex-1 overflow-hidden">
        <DoctorAnalyticsContentSkeleton />
      </div>
    </div>
  );
}

/* ══════════════ Financials (/financials) ══════════════ */

export function FinancialsContentSkeleton() {
  return (
    <div className="p-4 space-y-4 max-w-full">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} className="p-4">
            <Bone className="h-3 w-16 rounded mb-2" />
            <Bone className="h-6 w-20 rounded" />
            <Bone className="h-2.5 w-14 rounded mt-2" />
          </SkeletonCard>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i} className="p-4">
            <Bone className="h-3 w-24 rounded mb-2" />
            <Bone className="h-6 w-24 rounded" />
          </SkeletonCard>
        ))}
      </div>
      <SkeletonCard className="p-4">
        <Bone className="h-4 w-56 rounded mb-3" />
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <Bone className="h-4 w-36 rounded" />
                <Bone className="h-4 w-20 rounded" />
              </div>
              <Bone className="h-1.5 w-full rounded-full ml-6" />
            </div>
          ))}
        </div>
      </SkeletonCard>
      <SkeletonCard className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--ds-border)]">
          <Bone className="h-4 w-44 rounded" />
        </div>
        <ListRowsSkeleton rows={4} avatar={false} card={false} className="[&>div>div]:border-0" />
      </SkeletonCard>
    </div>
  );
}

export function FinancialsPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-24">
      <PageHeaderSkeleton actions={2} bottom={<FilterPillsSkeleton count={5} />} />
      <FinancialsContentSkeleton />
    </div>
  );
}

/* ══════════════ Admin finance (/admin/finance) ══════════════ */

export function AdminFinanceContentSkeleton() {
  return (
    <div className="p-4 pb-12 space-y-4 max-w-7xl mx-auto">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="p-4">
            <Bone className="h-3 w-16 rounded mb-3" />
            <Bone className="h-7 w-24 rounded" />
          </SkeletonCard>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i} className="p-4">
            <Bone className="h-3 w-28 rounded mb-2" />
            <Bone className="h-6 w-24 rounded" />
          </SkeletonCard>
        ))}
      </div>
      <ChartCardSkeleton height="h-40" />
      <SkeletonCard className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--ds-border)]">
          <Bone className="h-4 w-40 rounded" />
        </div>
        <ListRowsSkeleton rows={5} avatar={false} card={false} />
      </SkeletonCard>
    </div>
  );
}

export function AdminFinancePageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope">
      <PageHeaderSkeleton back={false} bottom={<FilterPillsSkeleton count={5} />} />
      <AdminFinanceContentSkeleton />
    </div>
  );
}

/* ══════════════ Analytics (/analytics) ══════════════ */

export function QACardSkeleton() {
  return (
    <SkeletonCard className="p-4 flex flex-col gap-1">
      <Bone className="h-4 w-4/5 rounded" />
      <Bone className="h-7 w-20 rounded-xl mt-2" />
      <Bone className="h-3 w-2/3 rounded mt-1" />
    </SkeletonCard>
  );
}

export function AnalyticsContentSkeleton() {
  return (
    <div className="p-4 space-y-6 pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <QACardSkeleton key={i} />
        ))}
      </div>
      <ChartCardSkeleton height="h-44" />
    </div>
  );
}

export function AnalyticsPageSkeleton() {
  return (
    <div className="h-full min-h-screen flex flex-col bg-[var(--bg)] font-manrope">
      <PageHeaderSkeleton subtitle bottom={<FilterPillsSkeleton count={5} />} />
      <div className="flex-1 overflow-hidden">
        <AnalyticsContentSkeleton />
      </div>
    </div>
  );
}

/* ══════════════ Payroll (/payroll/my) ══════════════ */

export function PayrollMyPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-10">
      <PageHeaderSkeleton />
      <div className="px-4 mt-4 space-y-3">
        <SkeletonCard className="p-5 space-y-3">
          <Bone className="h-3 w-24 rounded" />
          <Bone className="h-9 w-40 rounded-xl" />
          <div className="border-t border-[var(--ds-border)] pt-3 space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Bone className="h-3.5 w-28 rounded" />
                <Bone className="h-3.5 w-20 rounded" />
              </div>
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard className="p-5">
          <Bone className="h-4 w-32 rounded mb-3" />
          <Bone className="h-3 w-48 rounded" />
        </SkeletonCard>
      </div>
    </div>
  );
}

/* ══════════════ Role dashboards (route fallbacks) ══════════════ */

/** Owner home: service tile row + promo banners + profit card. */
export function OwnerDashboardSkeleton() {
  return (
    <div className="dashboard-page min-h-full pb-8">
      <div className="pt-4 px-4 flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 shrink-0 w-[68px]">
            <Bone className="w-[56px] h-[56px] rounded-[18px]" />
            <Bone className="h-2.5 w-12 rounded" />
          </div>
        ))}
      </div>
      <div className="mt-3 px-4 flex gap-3 overflow-hidden">
        <Bone className="shrink-0 w-[280px] h-[108px] rounded-3xl" />
        <Bone className="shrink-0 w-[280px] h-[108px] rounded-3xl" />
      </div>
      <div className="mx-4 mt-4 bg-white rounded-3xl border border-[var(--ds-border)] shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <Bone className="h-6 w-36 rounded-lg" />
          <div className="flex gap-2 mt-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Bone key={i} className="h-9 w-20 rounded-full shrink-0" />
            ))}
          </div>
        </div>
        <div className="divide-y divide-[var(--surface-2)]">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3.5 px-5 py-3.5">
              <Bone className="w-[52px] h-[52px] rounded-2xl shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Bone className="h-4 w-32 rounded" />
                <Bone className="h-3 w-24 rounded" />
              </div>
              <Bone className="h-4 w-16 rounded" />
            </div>
          ))}
        </div>
        <div className="mx-4 my-4">
          <Bone className="h-12 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/** Clinical home (doctor, assistant, nurse): service tiles + promo banners. */
export function DoctorDashboardSkeleton() {
  return (
    <div className="dashboard-page min-h-full pb-8">
      <div className="pt-4 px-4 flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 shrink-0 w-[68px]">
            <Bone className="w-[56px] h-[56px] rounded-[18px]" />
            <Bone className="h-2.5 w-12 rounded" />
          </div>
        ))}
      </div>
      <div className="mt-3 px-4 flex gap-3 overflow-hidden">
        <Bone className="shrink-0 w-[280px] h-[108px] rounded-3xl" />
        <Bone className="shrink-0 w-[280px] h-[108px] rounded-3xl" />
        <Bone className="shrink-0 w-[280px] h-[108px] rounded-3xl" />
      </div>
    </div>
  );
}

/** Accountant home: dash header + 4 KPI + payroll/leaderboard grid. */
export function AccountantDashboardSkeleton() {
  return (
    <div className="dashboard-page min-h-full">
      <div className="dash-page-inner-lg dash-stack">
        <div className="dash-page-header">
          <div className="space-y-2">
            <Bone className="h-7 w-56 rounded-xl" />
            <Bone className="h-4 w-40 rounded" />
          </div>
          <div className="flex gap-3">
            <Bone className="h-10 w-10 rounded-xl" />
            <Bone className="h-10 w-32 rounded-xl" />
            <Bone className="h-10 w-32 rounded-xl" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} className="p-5">
              <Bone className="w-11 h-11 rounded-xl mb-4" />
              <Bone className="h-4 w-24 rounded mb-2" />
              <Bone className="h-8 w-20 rounded" />
            </SkeletonCard>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard className="p-5">
            <Bone className="h-4 w-24 rounded mb-4" />
            <Bone className="h-8 w-32 rounded mb-3" />
            <Bone className="h-3 w-40 rounded" />
          </SkeletonCard>
          <SkeletonCard className="lg:col-span-2 p-5">
            <Bone className="h-4 w-44 rounded mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <Bone className="h-4 w-36 rounded" />
                    <Bone className="h-4 w-16 rounded" />
                  </div>
                  <Bone className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}

/** Warehouse home: dash header + 3 stat cards + inventory table + writeoffs. */
export function WarehouseDashboardSkeleton() {
  return (
    <div className="dashboard-page min-h-full">
      <div className="dash-page-inner-lg dash-stack">
        <div className="dash-page-header">
          <div className="space-y-2">
            <Bone className="h-7 w-56 rounded-xl" />
            <Bone className="h-4 w-40 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} className="p-5">
              <Bone className="w-11 h-11 rounded-xl mb-4" />
              <Bone className="h-4 w-24 rounded mb-2" />
              <Bone className="h-8 w-20 rounded" />
            </SkeletonCard>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard className="lg:col-span-2 p-5">
            <Bone className="h-4 w-40 rounded mb-6" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Bone key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          </SkeletonCard>
          <SkeletonCard className="p-5">
            <Bone className="h-4 w-36 rounded mb-4" />
            <ListRowsSkeleton rows={4} avatar={false} card={false} />
          </SkeletonCard>
        </div>
      </div>
    </div>
  );
}

/* ══════════ Tooth detail (/patients/:id/teeth/:fdi) ══════════ */

export function ToothDetailContentSkeleton() {
  return (
    <div className="h-full p-4 space-y-4 overflow-hidden">
      <SkeletonCard className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <Bone className="w-12 h-12 rounded-2xl shrink-0" />
          <div className="space-y-2">
            <Bone className="h-5 w-36 rounded" />
            <Bone className="h-3 w-24 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Bone className="h-24 rounded-xl" />
          <Bone className="h-24 rounded-xl" />
        </div>
      </SkeletonCard>
      <SkeletonCard className="p-5">
        <Bone className="h-4 w-40 rounded mb-4" />
        <ListRowsSkeleton rows={3} avatar={false} card={false} />
      </SkeletonCard>
    </div>
  );
}

export function ToothDetailPageSkeleton() {
  return (
    <div className="h-full min-h-screen flex flex-col bg-[var(--bg)] font-manrope">
      <div className="shrink-0 border-b border-[var(--ds-border)] bg-white shadow-sm px-4 py-3">
        <Bone className="h-7 w-44 rounded-xl" />
      </div>
      <div className="flex-1 overflow-hidden">
        <ToothDetailContentSkeleton />
      </div>
    </div>
  );
}

/* ══════════════ Staff / Users (/users) ══════════════ */

export function UsersPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope">
      <PageHeaderSkeleton actions={3} />
      <div className="p-5">
        <TableSkeleton rows={7} columns={5} />
      </div>
    </div>
  );
}

export function StaffDetailPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope">
      <PageHeaderSkeleton subtitle bottom={<FilterPillsSkeleton count={4} />} />
      <div className="p-4 grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} className="p-4 h-[130px] flex flex-col justify-between">
            <Bone className="h-3 w-20 rounded" />
            <Bone className="h-7 w-16 rounded-lg" />
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}

/* ══════════════ Phase 3: operations pages ══════════════ */

export function InventoryListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} className="p-3.5 flex items-center gap-3">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Bone className="h-4 w-36 max-w-full rounded" />
              <Bone className="h-5 w-16 rounded-full" />
            </div>
            <Bone className="h-3 w-28 rounded" />
          </div>
          <Bone className="h-7 w-14 rounded-xl shrink-0" />
        </SkeletonCard>
      ))}
    </div>
  );
}

export function InventoryPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-8">
      <PageHeaderSkeleton subtitle actions={1} />
      <div className="px-4 pt-4 space-y-3">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bone key={i} className="h-8 w-20 rounded-full shrink-0" />
          ))}
        </div>
        <Bone className="h-10 w-full rounded-xl" />
        <InventoryListSkeleton />
      </div>
    </div>
  );
}

export function WarehousePageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-24">
      <PageHeaderSkeleton />
      <div className="p-4 space-y-4">
        <Bone className="h-10 w-full rounded-xl" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} className="p-4">
              <Bone className="h-3 w-16 rounded mb-2" />
              <Bone className="h-6 w-12 rounded" />
            </SkeletonCard>
          ))}
        </div>
        <SkeletonCard className="overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--ds-border)]">
            <Bone className="h-4 w-32 rounded" />
          </div>
          <ListRowsSkeleton rows={5} avatar={false} card={false} />
        </SkeletonCard>
      </div>
    </div>
  );
}

export function ServicesTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-[var(--ds-border)] shadow-md overflow-hidden">
      <div className="grid grid-cols-[56px_1fr_120px_80px] px-4 py-2.5 border-b border-[var(--ds-border)] bg-[var(--bg)] gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-3 rounded" />
        ))}
      </div>
      <div className="divide-y divide-[var(--ds-border)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="grid grid-cols-[56px_1fr_120px_80px] items-center px-4 py-3 gap-3">
            <Bone className="h-3 w-10 rounded" />
            <Bone className="h-4 w-full max-w-xs rounded" />
            <Bone className="h-4 w-16 rounded ml-auto" />
            <Bone className="h-6 w-6 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ServicesPageSkeleton() {
  return (
    <div className="h-full min-h-screen flex flex-col bg-[var(--bg)] font-manrope overflow-hidden">
      <PageHeaderSkeleton subtitle actions={1} />
      <div className="px-4 pt-3 space-y-3 flex-1">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bone key={i} className="h-8 w-24 rounded-xl shrink-0" />
          ))}
        </div>
        <Bone className="h-10 w-full rounded-xl" />
        <ServicesTableSkeleton />
      </div>
    </div>
  );
}

export function LogsPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-24">
      <PageHeaderSkeleton subtitle />
      <div className="px-4 pt-4 space-y-4">
        <SkeletonCard className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Bone key={i} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard className="overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--ds-border)] flex items-center justify-between">
            <Bone className="h-4 w-24 rounded" />
            <Bone className="h-8 w-28 rounded-xl" />
          </div>
          <div className="divide-y divide-[var(--ds-border)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-start gap-4 pl-6 border-l-4 border-l-[var(--surface-2)]">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Bone className="h-5 w-20 rounded-full" />
                    <Bone className="h-3 w-28 rounded" />
                  </div>
                  <Bone className="h-4 w-full max-w-md rounded" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>
    </div>
  );
}

/** Chat: sidebar patient list + empty main pane. */
export function ChatPageSkeleton() {
  return (
    <div className="h-full min-h-screen flex bg-[var(--bg)] font-manrope">
      <aside className="w-full md:w-[320px] shrink-0 border-r border-[var(--ds-border)] flex flex-col bg-[var(--ds-surface)]">
        <PageHeaderSkeleton actions={2} bottom={<Bone className="h-9 w-full rounded-xl" />} />
        <div className="flex-1 p-3 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bone key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </aside>
      <main className="hidden md:flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <Bone className="w-16 h-16 rounded-2xl" />
        <Bone className="h-4 w-48 rounded" />
        <Bone className="h-3 w-36 rounded" />
      </main>
    </div>
  );
}

export function ChatMessagesSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
          <Bone className={cn("h-12 rounded-2xl", i % 2 === 0 ? "w-3/5" : "w-2/5")} />
        </div>
      ))}
    </div>
  );
}

export function ChatbotPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-8">
      <PageHeaderSkeleton actions={1} />
      <div className="px-4 pt-3 space-y-4">
        <div className="flex gap-1 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bone key={i} className="h-9 w-24 rounded-xl shrink-0" />
          ))}
        </div>
        <ListRowsSkeleton rows={5} avatar card />
      </div>
    </div>
  );
}

export function ChannelsPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-8">
      <PageHeaderSkeleton />
      <div className="px-4 pt-4 space-y-4">
        <SkeletonCard className="p-5">
          <Bone className="h-4 w-40 rounded mb-4" />
          <ListRowsSkeleton rows={3} avatar={false} card={false} />
        </SkeletonCard>
      </div>
    </div>
  );
}

export function MenuPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-8">
      <RootTabHeaderSkeleton />
      <div className="px-4 pt-2 space-y-4">
        {Array.from({ length: 3 }).map((_, c) => (
          <SkeletonCard key={c} className="px-3 pt-4 pb-2">
            <Bone className="h-3 w-24 rounded mx-2 mb-3" />
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2 py-3">
                  <Bone className="w-14 h-14 rounded-2xl" />
                  <Bone className="h-2.5 w-12 rounded" />
                </div>
              ))}
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}

export function AiCreditsPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-8">
      <PageHeaderSkeleton subtitle actions={1} />
      <div className="px-4 pt-4 space-y-4 max-w-2xl mx-auto">
        <SkeletonCard className="p-5">
          <Bone className="h-3 w-28 rounded mb-3" />
          <Bone className="h-9 w-32 rounded-xl mb-4" />
          <Bone className="h-2 w-full rounded-full mb-2" />
          <Bone className="h-3 w-40 rounded" />
        </SkeletonCard>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonCard key={i} className="p-4">
              <Bone className="h-3 w-20 rounded mb-2" />
              <Bone className="h-6 w-16 rounded" />
            </SkeletonCard>
          ))}
        </div>
        <SkeletonCard className="overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--ds-border)]">
            <Bone className="h-4 w-32 rounded" />
          </div>
          <ListRowsSkeleton rows={4} avatar={false} card={false} />
        </SkeletonCard>
      </div>
    </div>
  );
}

/* ══════════════ Phase 4: settings & system ══════════════ */

export function ContractTemplatesPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-8">
      <PageHeaderSkeleton />
      <div className="px-4 pt-4 max-w-2xl mx-auto space-y-4">
        <Bone className="h-28 w-full rounded-2xl" />
        <SkeletonCard className="p-5">
          <Bone className="h-4 w-40 rounded mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Bone key={i} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        </SkeletonCard>
      </div>
    </div>
  );
}

export function MigrationPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-8">
      <PageHeaderSkeleton />
      <div className="px-4 pt-4 max-w-2xl mx-auto space-y-4">
        <SkeletonCard className="p-5">
          <Bone className="h-4 w-36 rounded mb-4" />
          <Bone className="h-32 w-full rounded-2xl" />
        </SkeletonCard>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonCard key={i} className="p-4 h-28" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function BranchesPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-8">
      <PageHeaderSkeleton />
      <div className="px-4 pt-4 space-y-4">
        <Bone className="h-48 w-full rounded-2xl" />
        <ListRowsSkeleton rows={4} avatar card />
      </div>
    </div>
  );
}

export function ClinicBranchesPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-8">
      <PageHeaderSkeleton actions={1} />
      <div className="px-4 pt-4 space-y-3">
        <Bone className="h-16 w-full rounded-2xl" />
        <ListRowsSkeleton rows={4} avatar={false} card />
      </div>
    </div>
  );
}

/** Patient detail slide-over panel. */
export function PatientPanelSkeleton() {
  return (
    <div className="h-full flex flex-col bg-[var(--ds-surface)]">
      <div className="px-4 py-3 border-b border-[var(--ds-border)] flex items-center justify-between">
        <Bone className="h-5 w-40 rounded" />
        <Bone className="w-8 h-8 rounded-full" />
      </div>
      <div className="flex gap-2 px-4 py-3 border-b border-[var(--ds-border)]">
        {Array.from({ length: 2 }).map((_, i) => (
          <Bone key={i} className="h-8 flex-1 rounded-xl" />
        ))}
      </div>
      <div className="flex-1 p-4 space-y-4 overflow-hidden">
        <SkeletonCard className="p-4 space-y-3">
          <Bone className="h-4 w-32 rounded" />
          <Bone className="h-10 w-full rounded-xl" />
          <Bone className="h-10 w-full rounded-xl" />
        </SkeletonCard>
        <SkeletonCard className="p-4">
          <Bone className="h-4 w-28 rounded mb-3" />
          <div className="space-y-2">
            <Bone className="h-3 w-full rounded-full" />
            <Bone className="h-3 w-4/5 rounded-full" />
            <Bone className="h-3 w-3/5 rounded-full" />
          </div>
        </SkeletonCard>
      </div>
    </div>
  );
}

/** Generic route fallback: header + content cards. */
export function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope">
      <PageHeaderSkeleton subtitle />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonCard key={i} className="p-4 h-24" />
          ))}
        </div>
        <SkeletonCard className="p-4">
          <Bone className="h-4 w-40 rounded mb-4" />
          <ListRowsSkeleton rows={4} avatar={false} card={false} />
        </SkeletonCard>
      </div>
    </div>
  );
}

/** Auth session check: mimics app shell without specific page content. */
export function AuthShellSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope">
      <div className="h-14 border-b border-[var(--ds-border)] bg-[var(--ds-surface)] px-4 flex items-center gap-3">
        <Bone className="h-8 w-8 rounded-full" />
        <Bone className="h-5 w-32 rounded-lg" />
      </div>
      <div className="p-4 space-y-3">
        <Bone className="h-32 w-full rounded-2xl" />
        <Bone className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/* ══════════════ Account & pricing pages ══════════════ */

export function AccountSettingsPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-8">
      <RootTabHeaderSkeleton />
      <div className="pt-2 px-4 space-y-5">
        <SkeletonCard className="px-4 py-4">
          <div className="flex items-center gap-3.5">
            <Bone className="w-16 h-16 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Bone className="h-5 w-36 rounded" />
              <Bone className="h-3 w-48 rounded" />
              <Bone className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </SkeletonCard>
        <Bone className="h-3 w-24 rounded mx-2" />
        <SkeletonCard>
          <ListRowsSkeleton rows={3} avatar card={false} />
        </SkeletonCard>
        <Bone className="h-3 w-28 rounded mx-2" />
        <SkeletonCard>
          <ListRowsSkeleton rows={4} avatar card={false} />
        </SkeletonCard>
      </div>
    </div>
  );
}

export function AccountFormPageSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-8">
      <PageHeaderSkeleton back />
      <div className="px-4 pt-4">
        <SkeletonCard className="p-4">
          <FormSkeleton fields={fields} />
        </SkeletonCard>
      </div>
    </div>
  );
}

export function PricingPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg)] font-manrope pb-8">
      <PageHeaderSkeleton />
      <div className="px-4 pt-4 space-y-4">
        <Bone className="h-20 w-full rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} className="p-5 h-64" />
          ))}
        </div>
        <SkeletonCard className="p-4 h-48" />
      </div>
    </div>
  );
}
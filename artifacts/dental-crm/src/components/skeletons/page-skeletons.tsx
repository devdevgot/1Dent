import {
  Bone,
  PageHeaderSkeleton,
  SkeletonCard,
  ChartCardSkeleton,
  ListRowsSkeleton,
  FormSkeleton,
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
import { Bone } from "@/components/skeletons/primitives";
import { cn } from "@/lib/utils";

type AuthSkeletonVariant = "login" | "register-disclaimer" | "register-form" | "register-wide";

function AuthLayoutSkeleton({
  wide = false,
  hideMobileBranding = false,
  children,
}: {
  wide?: boolean;
  hideMobileBranding?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] w-full bg-[#faf8f4] font-manrope flex">
      <aside className="hidden lg:flex lg:w-[46%] xl:w-1/2 relative overflow-hidden bg-[#0f172a]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#1f75fe]/40" />
        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-14 w-full">
          <div>
            <div className="flex items-center gap-3 mb-10">
              <Bone className="w-11 h-11 rounded-xl shrink-0 bg-white/10" />
              <div className="space-y-1.5">
                <Bone className="h-4 w-16 rounded bg-white/15" />
                <Bone className="h-2.5 w-28 rounded bg-white/10" />
              </div>
            </div>
            <Bone className="h-9 w-4/5 max-w-sm rounded-xl bg-white/15 mb-4" />
            <Bone className="h-4 w-full max-w-md rounded bg-white/10 mb-2" />
            <Bone className="h-4 w-3/4 max-w-sm rounded bg-white/10" />
            <div className="space-y-3 mt-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <Bone className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#1f75fe]/60" />
                  <Bone className="h-3.5 w-48 max-w-full rounded bg-white/10" />
                </div>
              ))}
            </div>
          </div>
          <Bone className="h-2.5 w-20 rounded bg-white/10" />
        </div>
      </aside>

      <main className="flex-1 flex flex-col items-center justify-center px-5 sm:px-8 py-8 overflow-y-auto">
        {!hideMobileBranding && (
          <div className="lg:hidden flex flex-col items-center mb-6">
            <Bone className="w-14 h-14 rounded-2xl mb-2" />
            <Bone className="h-4 w-14 rounded mb-1" />
            <Bone className="h-2.5 w-28 rounded" />
          </div>
        )}

        <div
          className={cn(
            "w-full bg-white rounded-2xl border border-[#e8e3d9] shadow-md p-6 sm:p-7",
            wide ? "max-w-lg" : "max-w-md",
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}

function LoginCardSkeleton() {
  return (
    <>
      <Bone className="h-6 w-40 rounded-lg mx-auto mb-2" />
      <Bone className="h-3.5 w-56 max-w-full rounded mx-auto mb-5" />
      <div className="space-y-2.5">
        <div className="rounded-xl border border-[#e8e3d9] px-3.5 py-2.5 space-y-1.5">
          <Bone className="h-3 w-24 rounded" />
          <Bone className="h-4 w-full rounded" />
        </div>
        <div className="rounded-xl border border-[#e8e3d9] px-3.5 py-2.5 space-y-1.5">
          <Bone className="h-3 w-16 rounded" />
          <Bone className="h-4 w-full rounded" />
        </div>
        <div className="flex justify-end">
          <Bone className="h-3 w-28 rounded" />
        </div>
        <Bone className="h-11 w-full rounded-full" />
      </div>
      <div className="text-center mt-4">
        <Bone className="h-3.5 w-44 rounded mx-auto" />
      </div>
    </>
  );
}

function RegisterDisclaimerCardSkeleton() {
  return (
    <>
      <div className="flex justify-center gap-4 mb-6 px-2">
        <Bone className="w-14 h-14 rounded-2xl shrink-0" />
        <Bone className="w-[72px] h-[72px] rounded-2xl shrink-0" />
        <Bone className="w-14 h-14 rounded-2xl shrink-0" />
      </div>
      <Bone className="h-6 w-44 rounded-lg mx-auto mb-2" />
      <Bone className="h-3.5 w-full max-w-xs rounded mx-auto mb-6" />
      <div className="rounded-2xl border border-[#e8e3d9] p-4 mb-5 space-y-4">
        <div className="flex items-start gap-3 pb-4 border-b border-[#f1ede4]">
          <Bone className="w-11 h-11 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <Bone className="h-3 w-16 rounded" />
            <Bone className="h-3.5 w-full rounded" />
            <Bone className="h-3.5 w-4/5 rounded" />
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Bone className="w-9 h-9 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Bone className="h-3.5 w-48 rounded" />
            <Bone className="h-3.5 w-full rounded" />
          </div>
        </div>
      </div>
      <Bone className="h-11 w-full rounded-full mb-4" />
      <Bone className="h-3.5 w-40 rounded mx-auto" />
    </>
  );
}

function RegisterFormCardSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <>
      <div className="h-8 mb-2 flex items-center justify-between">
        <Bone className="w-8 h-8 rounded-lg" />
        <Bone className="h-3 w-12 rounded" />
      </div>
      <div className="flex items-center justify-center gap-1.5 mb-5">
        <Bone className="w-5 h-1.5 rounded-full" />
        <Bone className="w-1.5 h-1.5 rounded-full" />
        <Bone className="w-1.5 h-1.5 rounded-full" />
      </div>
      <div className="flex items-center gap-2.5 mb-4">
        <Bone className="w-8 h-8 rounded-xl shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Bone className="h-3.5 w-28 rounded" />
          <Bone className="h-2.5 w-40 rounded" />
        </div>
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: wide ? 1 : 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-[#e8e3d9] px-3.5 py-2.5 space-y-1.5">
            <Bone className="h-3 w-24 rounded" />
            <Bone className="h-4 w-full rounded" />
          </div>
        ))}
        {wide && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Bone key={i} className="h-[88px] rounded-xl" />
            ))}
          </div>
        )}
        <Bone className="h-11 w-full rounded-full mt-2" />
      </div>
    </>
  );
}

export function LoginPageSkeleton() {
  return (
    <AuthLayoutSkeleton>
      <LoginCardSkeleton />
    </AuthLayoutSkeleton>
  );
}

export function RegisterDisclaimerPageSkeleton() {
  return (
    <AuthLayoutSkeleton>
      <RegisterDisclaimerCardSkeleton />
    </AuthLayoutSkeleton>
  );
}

export function RegisterFormPageSkeleton() {
  return (
    <AuthLayoutSkeleton>
      <RegisterFormCardSkeleton />
    </AuthLayoutSkeleton>
  );
}

export function RegisterWidePageSkeleton() {
  return (
    <AuthLayoutSkeleton wide>
      <RegisterFormCardSkeleton wide />
    </AuthLayoutSkeleton>
  );
}

/** Session bootstrap while /me loads — same auth chrome, empty card pulse. */
export function AuthSessionSkeleton() {
  return (
    <AuthLayoutSkeleton>
      <div className="space-y-3 py-4">
        <Bone className="h-6 w-40 rounded-lg mx-auto" />
        <Bone className="h-3.5 w-52 rounded mx-auto" />
        <Bone className="h-24 w-full rounded-xl mt-4" />
        <Bone className="h-11 w-full rounded-full" />
      </div>
    </AuthLayoutSkeleton>
  );
}

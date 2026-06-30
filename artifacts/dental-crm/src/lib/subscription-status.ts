import type { Clinic } from "@workspace/api-client-react";

export type PlanId = "free" | "starter" | "professional" | "enterprise";

export type SubscriptionStatus =
  | { kind: "active_plan"; plan: PlanId; expiresAt: Date | null }
  | { kind: "active_trial"; expiresAt: Date }
  | { kind: "expired_plan"; plan: PlanId; expiresAt: Date }
  | { kind: "expired_trial"; expiresAt: Date }
  | { kind: "none" };

export function getClinicPlanFields(clinic: Clinic | null) {
  const clinicAny = clinic as (Clinic & {
    plan?: PlanId;
    trialEndsAt?: string | null;
    planExpiresAt?: string | null;
  }) | null;

  return {
    plan: clinicAny?.plan ?? "free",
    trialEndsAt: clinicAny?.trialEndsAt ?? null,
    planExpiresAt: clinicAny?.planExpiresAt ?? null,
  };
}

export function getSubscriptionStatus(clinic: Clinic | null): SubscriptionStatus {
  const { plan, trialEndsAt, planExpiresAt } = getClinicPlanFields(clinic);
  const now = new Date();
  const hasPaidPlan = plan !== "free";
  const planNotExpired = !planExpiresAt || new Date(planExpiresAt) > now;
  const trialActive = !!trialEndsAt && new Date(trialEndsAt) > now;

  if (hasPaidPlan && planNotExpired) {
    return {
      kind: "active_plan",
      plan,
      expiresAt: planExpiresAt ? new Date(planExpiresAt) : null,
    };
  }

  if (trialActive) {
    return { kind: "active_trial", expiresAt: new Date(trialEndsAt) };
  }

  if (hasPaidPlan && planExpiresAt && new Date(planExpiresAt) <= now) {
    return { kind: "expired_plan", plan, expiresAt: new Date(planExpiresAt) };
  }

  if (trialEndsAt && new Date(trialEndsAt) <= now) {
    return { kind: "expired_trial", expiresAt: new Date(trialEndsAt) };
  }

  return { kind: "none" };
}

export function isPlanAccessActive(clinic: Clinic | null): boolean {
  const status = getSubscriptionStatus(clinic);
  return status.kind === "active_plan" || status.kind === "active_trial";
}

export function canStartTrial(clinic: Clinic | null): boolean {
  return getSubscriptionStatus(clinic).kind === "none";
}

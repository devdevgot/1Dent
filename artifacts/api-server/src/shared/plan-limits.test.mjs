import { strict as assert } from "node:assert";
import {
  FREE_LIMITS,
  PLAN_LIMITS,
  TRIAL_LIMITS,
  isPaidPlanActive,
  isTrialActive,
  resolveMonthlyAiCreditLimit,
  resolvePlanLimits,
} from "./plan-limits.ts";

const future = new Date("2030-01-01T00:00:00Z");
const past = new Date("2020-01-01T00:00:00Z");

assert.equal(TRIAL_LIMITS.aiCredits, 50);
assert.equal(PLAN_LIMITS.starter.staff, 5);
assert.equal(PLAN_LIMITS.professional.staff, 15);
assert.equal(PLAN_LIMITS.enterprise.staff, 30);
assert.equal(PLAN_LIMITS.starter.branches, 1);
assert.equal(PLAN_LIMITS.professional.branches, 3);
assert.equal(PLAN_LIMITS.enterprise.branches, 10);
assert.equal(PLAN_LIMITS.starter.aiCredits, 500);
assert.equal(PLAN_LIMITS.professional.aiCredits, 3000);
assert.equal(PLAN_LIMITS.enterprise.aiCredits, 7000);
assert.equal(PLAN_LIMITS.starter.chatbotDialogs, 100);
assert.equal(PLAN_LIMITS.professional.chatbotDialogs, 1000);
assert.equal(PLAN_LIMITS.enterprise.chatbotDialogs, 5000);
assert.equal(PLAN_LIMITS.starter.documentTemplates, 5);
assert.equal(PLAN_LIMITS.professional.documentTemplates, 30);
assert.equal(PLAN_LIMITS.enterprise.documentTemplates, null);

assert.deepEqual(
  resolvePlanLimits({ plan: "starter", trialEndsAt: future, planExpiresAt: future }),
  PLAN_LIMITS.starter,
);
assert.deepEqual(
  resolvePlanLimits({ plan: "free", trialEndsAt: future, planExpiresAt: null }),
  TRIAL_LIMITS,
);
assert.deepEqual(
  resolvePlanLimits({ plan: "free", trialEndsAt: past, planExpiresAt: null }),
  FREE_LIMITS,
);
assert.deepEqual(
  resolvePlanLimits({ plan: "professional", trialEndsAt: past, planExpiresAt: future }),
  PLAN_LIMITS.professional,
);

assert.equal(
  resolveMonthlyAiCreditLimit({ plan: "starter", trialEndsAt: future, planExpiresAt: future }),
  500,
);
assert.equal(
  resolveMonthlyAiCreditLimit({ plan: "free", trialEndsAt: future, planExpiresAt: null }),
  50,
);

assert.equal(isTrialActive(future), true);
assert.equal(isTrialActive(past), false);
assert.equal(isPaidPlanActive("starter", future), true);
assert.equal(isPaidPlanActive("starter", past), false);
assert.equal(isPaidPlanActive("free", future), false);

console.log("plan-limits tests passed");

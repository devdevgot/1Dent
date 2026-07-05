import { randomUUID } from "crypto";
import { db, chatbotFunnelEventsTable } from "@workspace/db";
import type { ChatbotSettings, ScriptVariant } from "@workspace/db";
import { and, eq, gte } from "drizzle-orm";
import { logger } from "../../lib/logger";
import type { ChatbotState } from "./chatbot.types";
import { DEFAULT_BOOKING_MIND_MAP } from "./booking-script";

export type FunnelEventType =
  | "state_transition"
  | "booking_completed"
  | "refused"
  | "handoff";

const FUNNEL_STAGES: ChatbotState[] = [
  "greeting",
  "collect_iin",
  "collect_problem",
  "collect_qualification",
  "suggest_doctor",
  "await_decision",
  "handle_objections",
  "collect_datetime",
  "collect_branch",
  "confirm_appointment",
  "manage_appointment",
  "collect_review",
  "done",
];

export function assignAbVariant(settings: ChatbotSettings, existingVariantId?: string): string | undefined {
  if (!settings.abTestEnabled) return undefined;
  const variants = (settings.scriptVariants ?? []) as ScriptVariant[];
  const active = variants.filter((v) => v.weight > 0);
  if (active.length === 0) return undefined;

  if (existingVariantId && active.some((v) => v.id === existingVariantId)) {
    return existingVariantId;
  }

  const total = active.reduce((s, v) => s + v.weight, 0);
  let r = Math.random() * total;
  for (const v of active) {
    r -= v.weight;
    if (r <= 0) return v.id;
  }
  return active[0]!.id;
}

export function applyAbVariantToSettings(
  settings: ChatbotSettings,
  variantId?: string,
): ChatbotSettings {
  if (!variantId || !settings.abTestEnabled) return settings;
  const variant = (settings.scriptVariants as ScriptVariant[] | undefined)?.find((v) => v.id === variantId);
  if (!variant) return settings;

  return {
    ...settings,
    greetingTemplate: variant.greetingTemplate ?? settings.greetingTemplate,
    scriptBlocks: variant.scriptBlocks?.length ? variant.scriptBlocks : settings.scriptBlocks,
    scriptMindMap: variant.scriptMindMap?.nodes?.length ? variant.scriptMindMap : settings.scriptMindMap,
    stepInstructions: variant.stepInstructions
      ? { ...(settings.stepInstructions ?? {}), ...variant.stepInstructions }
      : settings.stepInstructions,
  };
}

export function logFunnelEvent(params: {
  clinicId: string;
  phone: string;
  sessionId?: string;
  variantId?: string;
  eventType: FunnelEventType;
  fromState?: string;
  toState?: string;
}): void {
  db.insert(chatbotFunnelEventsTable)
    .values({
      id: randomUUID(),
      clinicId: params.clinicId,
      phone: params.phone,
      sessionId: params.sessionId ?? null,
      variantId: params.variantId ?? null,
      eventType: params.eventType,
      fromState: params.fromState ?? null,
      toState: params.toState ?? null,
    })
    .catch((err) => logger.warn({ err }, "[ChatbotFunnel] failed to log event"));
}

export interface FunnelStageMetric {
  state: string;
  entered: number;
  progressed: number;
  conversionRate: number;
}

export interface VariantFunnelMetric {
  variantId: string;
  variantName: string;
  sessions: number;
  bookings: number;
  bookingRate: number;
  handoffs: number;
}

export interface ChatbotFunnelAnalytics {
  periodDays: number;
  totalSessions: number;
  totalBookings: number;
  overallBookingRate: number;
  stages: FunnelStageMetric[];
  variants: VariantFunnelMetric[];
}

export async function getChatbotFunnelAnalytics(
  clinicId: string,
  days = 30,
): Promise<ChatbotFunnelAnalytics> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const events = await db
    .select()
    .from(chatbotFunnelEventsTable)
    .where(and(eq(chatbotFunnelEventsTable.clinicId, clinicId), gte(chatbotFunnelEventsTable.createdAt, since)));

  const transitions = events.filter((e) => e.eventType === "state_transition" && e.toState);
  const bookings = events.filter((e) => e.eventType === "booking_completed").length;
  const sessionPhones = new Set(transitions.map((e) => e.phone));
  const totalSessions = sessionPhones.size;

  const stageEntered = new Map<string, number>();
  const stageProgressed = new Map<string, number>();

  for (const stage of FUNNEL_STAGES) {
    stageEntered.set(stage, 0);
    stageProgressed.set(stage, 0);
  }

  for (const e of transitions) {
    const to = e.toState!;
    stageEntered.set(to, (stageEntered.get(to) ?? 0) + 1);
    if (e.fromState) {
      stageProgressed.set(e.fromState, (stageProgressed.get(e.fromState) ?? 0) + 1);
    }
  }

  const stages: FunnelStageMetric[] = FUNNEL_STAGES.filter((s) => s !== "done").map((state) => {
    const entered = stageEntered.get(state) ?? 0;
    const progressed = bookings;
    const conversionRate = entered > 0 ? Math.round((progressed / entered) * 100) : 0;
    return { state, entered, progressed, conversionRate };
  });

  const variantStats = new Map<string, { sessions: Set<string>; bookings: number; handoffs: number }>();
  for (const e of events) {
    const vid = e.variantId ?? "control";
    if (!variantStats.has(vid)) {
      variantStats.set(vid, { sessions: new Set(), bookings: 0, handoffs: 0 });
    }
    const stat = variantStats.get(vid)!;
    stat.sessions.add(e.phone);
    if (e.eventType === "booking_completed") stat.bookings += 1;
    if (e.eventType === "handoff") stat.handoffs += 1;
  }

  const variants: VariantFunnelMetric[] = [...variantStats.entries()].map(([variantId, stat]) => ({
    variantId,
    variantName: variantId === "control" ? "Контроль (основной скрипт)" : variantId,
    sessions: stat.sessions.size,
    bookings: stat.bookings,
    bookingRate: stat.sessions.size > 0 ? Math.round((stat.bookings / stat.sessions.size) * 100) : 0,
    handoffs: stat.handoffs,
  }));

  return {
    periodDays: days,
    totalSessions,
    totalBookings: bookings,
    overallBookingRate: totalSessions > 0 ? Math.round((bookings / totalSessions) * 100) : 0,
    stages,
    variants,
  };
}

export { DEFAULT_BOOKING_MIND_MAP };

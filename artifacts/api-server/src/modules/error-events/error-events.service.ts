import { createHash, randomUUID } from "crypto";
import type { Request } from "express";
import { db, errorEventsTable } from "@workspace/db";
import type { ErrorEvent, ErrorEventSeverity, ErrorEventSource } from "@workspace/db";
import { and, count, desc, eq, gte, ilike, isNull, lte, or, type SQL } from "drizzle-orm";
import { logger } from "../../lib/logger";

const MAX_MESSAGE = 2_000;
const MAX_STACK = 8_000;
const MAX_URL = 2_000;

export interface CaptureErrorInput {
  source: ErrorEventSource;
  severity?: ErrorEventSeverity;
  message: string;
  stack?: string | null;
  code?: string | null;
  clinicId?: string | null;
  userId?: string | null;
  requestId?: string | null;
  url?: string | null;
  method?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ErrorEventsFilter {
  clinicId?: string;
  source?: ErrorEventSource;
  severity?: ErrorEventSeverity;
  unresolvedOnly?: boolean;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function buildFingerprint(input: CaptureErrorInput): string {
  const base = [
    input.source,
    input.code ?? "",
    input.message.slice(0, 200),
    input.stack?.split("\n")[0] ?? "",
  ].join("|");
  return createHash("sha256").update(base).digest("hex").slice(0, 32);
}

function serializeError(err: unknown): { message: string; stack: string | null; code: string | null } {
  if (err instanceof Error) {
    return {
      message: err.message || err.name || "Error",
      stack: err.stack ?? null,
      code: "code" in err && typeof (err as { code?: unknown }).code === "string"
        ? (err as { code: string }).code
        : null,
    };
  }
  if (typeof err === "string") {
    return { message: err, stack: null, code: null };
  }
  try {
    return { message: JSON.stringify(err), stack: null, code: null };
  } catch {
    return { message: "Unknown error", stack: null, code: null };
  }
}

export class ErrorEventsService {
  async capture(input: CaptureErrorInput): Promise<void> {
    const message = truncate(input.message.trim() || "Unknown error", MAX_MESSAGE)!;
    const stack = truncate(input.stack, MAX_STACK);
    const url = truncate(input.url, MAX_URL);
    const fingerprint = buildFingerprint({ ...input, message, stack: stack ?? undefined });

    try {
      await db.insert(errorEventsTable).values({
        id: randomUUID(),
        source: input.source,
        severity: input.severity ?? "error",
        message,
        stack,
        code: input.code ?? null,
        clinicId: input.clinicId ?? null,
        userId: input.userId ?? null,
        requestId: input.requestId ?? null,
        url,
        method: input.method ?? null,
        userAgent: truncate(input.userAgent, 500),
        metadata: input.metadata ?? null,
        fingerprint,
      });
    } catch (err) {
      logger.warn({ err, fingerprint }, "[error-events] failed to persist error event");
    }
  }

  captureSafe(input: CaptureErrorInput): void {
    void this.capture(input);
  }

  captureFromRequest(
    err: unknown,
    req: Request,
    overrides: Partial<CaptureErrorInput> = {},
  ): void {
    const { message, stack, code } = serializeError(err);
    this.captureSafe({
      source: "api",
      message,
      stack,
      code: overrides.code ?? code,
      clinicId: req.user?.clinicId ?? overrides.clinicId ?? null,
      userId: req.user?.userId ?? overrides.userId ?? null,
      requestId: String(req.id ?? ""),
      url: req.originalUrl,
      method: req.method,
      userAgent: req.headers["user-agent"] as string | undefined,
      metadata: overrides.metadata ?? null,
      ...overrides,
    });
  }

  async list(filter: ErrorEventsFilter): Promise<{
    events: ErrorEvent[];
    total: number;
    unresolvedTotal: number;
    page: number;
  }> {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 50));
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];
    if (filter.clinicId) conditions.push(eq(errorEventsTable.clinicId, filter.clinicId));
    if (filter.source) conditions.push(eq(errorEventsTable.source, filter.source));
    if (filter.severity) conditions.push(eq(errorEventsTable.severity, filter.severity));
    if (filter.unresolvedOnly) conditions.push(isNull(errorEventsTable.resolvedAt));
    if (filter.dateFrom) conditions.push(gte(errorEventsTable.createdAt, filter.dateFrom));
    if (filter.dateTo) conditions.push(lte(errorEventsTable.createdAt, filter.dateTo));
    if (filter.search?.trim()) {
      const q = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(errorEventsTable.message, q),
          ilike(errorEventsTable.stack, q),
          ilike(errorEventsTable.url, q),
          ilike(errorEventsTable.code, q),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [events, [totalRow], [unresolvedRow]] = await Promise.all([
      db
        .select()
        .from(errorEventsTable)
        .where(where)
        .orderBy(desc(errorEventsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(errorEventsTable).where(where),
      db
        .select({ total: count() })
        .from(errorEventsTable)
        .where(isNull(errorEventsTable.resolvedAt)),
    ]);

    return {
      events,
      total: totalRow?.total ?? 0,
      unresolvedTotal: unresolvedRow?.total ?? 0,
      page,
    };
  }

  async getById(id: string): Promise<ErrorEvent | undefined> {
    const [row] = await db
      .select()
      .from(errorEventsTable)
      .where(eq(errorEventsTable.id, id))
      .limit(1);
    return row;
  }

  async resolve(id: string): Promise<ErrorEvent | undefined> {
    const [row] = await db
      .update(errorEventsTable)
      .set({ resolvedAt: new Date() })
      .where(eq(errorEventsTable.id, id))
      .returning();
    return row;
  }
}

export const errorEventsService = new ErrorEventsService();

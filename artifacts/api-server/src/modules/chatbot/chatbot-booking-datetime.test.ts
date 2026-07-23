import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatAlmatyIso,
  parseAlmatyDatetime,
} from "./almaty-time.ts";

test("parseAlmatyDatetime keeps clinic-local offset for bare ISO", () => {
  const parsed = parseAlmatyDatetime("2026-07-24T15:00:00");
  assert.ok(parsed);
  // 15:00 Almaty = 10:00 UTC
  assert.equal(parsed!.toISOString(), "2026-07-24T10:00:00.000Z");
  assert.equal(formatAlmatyIso(parsed!), "2026-07-24T15:00:00+05:00");
});

test("parseAlmatyDatetime rejects natural-language garbage from LLM intent", () => {
  assert.equal(parseAlmatyDatetime("завтра в 15:00"), null);
  assert.equal(parseAlmatyDatetime("24.07.2026 15:00"), null);
  assert.equal(parseAlmatyDatetime(""), null);
});

test("naive new Date shifts bare ISO to UTC — why Almaty parse is required", () => {
  const naive = new Date("2026-07-24T15:00:00");
  assert.equal(naive.toISOString(), "2026-07-24T15:00:00.000Z");
  const clinic = parseAlmatyDatetime("2026-07-24T15:00:00")!;
  assert.notEqual(naive.toISOString(), clinic.toISOString());
});

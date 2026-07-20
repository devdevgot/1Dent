import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isBaseVersionCurrent,
  toTimestampMs,
} from "./optimistic-concurrency";

describe("optimistic-concurrency", () => {
  it("treats missing baseUpdatedAt as current (online LWW)", () => {
    assert.equal(isBaseVersionCurrent(new Date("2026-01-01T00:00:00.000Z"), undefined), true);
    assert.equal(isBaseVersionCurrent(new Date("2026-01-01T00:00:00.000Z"), null), true);
    assert.equal(isBaseVersionCurrent(new Date("2026-01-01T00:00:00.000Z"), ""), true);
  });

  it("matches equal ISO timestamps", () => {
    const iso = "2026-03-15T12:34:56.000Z";
    assert.equal(isBaseVersionCurrent(new Date(iso), iso), true);
    assert.equal(isBaseVersionCurrent(iso, new Date(iso)), true);
  });

  it("detects stale client base", () => {
    assert.equal(
      isBaseVersionCurrent(
        "2026-03-15T13:00:00.000Z",
        "2026-03-15T12:00:00.000Z",
      ),
      false,
    );
  });

  it("parses timestamps safely", () => {
    assert.equal(toTimestampMs(null), null);
    assert.equal(toTimestampMs("not-a-date"), null);
    assert.equal(toTimestampMs("2026-01-01T00:00:00.000Z"), Date.parse("2026-01-01T00:00:00.000Z"));
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldNotifyTelegram,
  formatAlert,
  canSendWithinHourlyCap,
  resetTelegramHourlyCapForTests,
  recordTelegramSendForTests,
} from "./error-events.policy";
import type { ErrorEvent } from "@workspace/db";

function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return {
    id: "evt-1",
    source: "api",
    severity: "error",
    message: "Something failed",
    stack: null,
    code: "VALIDATION_ERROR",
    clinicId: null,
    userId: null,
    requestId: null,
    url: "/api/patients",
    method: "POST",
    userAgent: null,
    metadata: null,
    fingerprint: "abc123",
    resolvedAt: null,
    createdAt: new Date("2026-07-08T12:00:00.000Z"),
    ...overrides,
  };
}

describe("shouldNotifyTelegram", () => {
  it("notifies all severities when mode is all", () => {
    assert.equal(shouldNotifyTelegram({ source: "api", severity: "warning", message: "x" }, "all"), true);
    assert.equal(shouldNotifyTelegram({ source: "api", severity: "error", message: "x" }, "all"), true);
    assert.equal(shouldNotifyTelegram({ source: "api", severity: "fatal", message: "x" }, "all"), true);
  });

  it("skips warnings in error_and_fatal mode", () => {
    assert.equal(
      shouldNotifyTelegram({ source: "dental-crm", severity: "warning", message: "x" }, "error_and_fatal"),
      false,
    );
    assert.equal(
      shouldNotifyTelegram({ source: "dental-crm", severity: "error", message: "x" }, "error_and_fatal"),
      true,
    );
  });

  it("only notifies fatal in fatal_only mode", () => {
    assert.equal(shouldNotifyTelegram({ source: "worker", severity: "error", message: "x" }, "fatal_only"), false);
    assert.equal(shouldNotifyTelegram({ source: "worker", severity: "fatal", message: "x" }, "fatal_only"), true);
  });
});

describe("formatAlert", () => {
  it("includes severity label and source without emoji stickers", () => {
    const text = formatAlert(makeEvent({ severity: "warning", source: "dental-crm" }));
    assert.match(text, /1Dent — Предупреждение/);
    assert.match(text, /CRM/);
    assert.match(text, /VALIDATION_ERROR/);
    assert.doesNotMatch(text, /🚨/);
  });

  it("escapes HTML in message body", () => {
    const text = formatAlert(makeEvent({ message: "<script>alert(1)</script>" }));
    assert.match(text, /&lt;script&gt;/);
    assert.doesNotMatch(text, /<script>/);
  });
});

describe("canSendWithinHourlyCap", () => {
  it("allows sends until cap is reached", () => {
    resetTelegramHourlyCapForTests();
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      assert.equal(canSendWithinHourlyCap(60, now + i), true);
      recordTelegramSendForTests(now + i);
    }
    assert.equal(canSendWithinHourlyCap(60, now + 60), false);
  });
});

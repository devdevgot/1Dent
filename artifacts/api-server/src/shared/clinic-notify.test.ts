import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isDuplicateNotify,
  stageLabel,
  NOTIFY_KINDS,
  groupForKind,
  rolesForKind,
} from "./clinic-notify-kinds";

describe("clinic-notify helpers", () => {
  it("stageLabel maps known statuses", () => {
    assert.equal(stageLabel("new_request"), "Новая заявка");
    assert.equal(stageLabel("unknown_x"), "unknown_x");
  });

  it("isDuplicateNotify coalesces within TTL", () => {
    const key = `test-dedup-${Date.now()}-${Math.random()}`;
    assert.equal(isDuplicateNotify(key, 60_000), false);
    assert.equal(isDuplicateNotify(key, 60_000), true);
  });

  it("maps kinds to groups and roles", () => {
    assert.equal(groupForKind(NOTIFY_KINDS.inbound_chat), "chats");
    assert.equal(groupForKind(NOTIFY_KINDS.pending_payment), "payments");
    assert.deepEqual(rolesForKind(NOTIFY_KINDS.ai_credits_exhausted), ["owner"]);
    assert.ok(rolesForKind(NOTIFY_KINDS.appointment_created).includes("doctor"));
  });
});

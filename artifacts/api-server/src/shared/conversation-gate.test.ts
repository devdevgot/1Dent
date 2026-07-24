import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeGatePhone } from "./conversation-gate";

describe("conversation-gate", () => {
  it("normalizeGatePhone canonicalizes KZ mobiles", () => {
    assert.equal(normalizeGatePhone("87001112233"), "+77001112233");
    assert.equal(normalizeGatePhone("+7 700 111 22 33"), "+77001112233");
    assert.equal(normalizeGatePhone("77001112233"), "+77001112233");
  });
});

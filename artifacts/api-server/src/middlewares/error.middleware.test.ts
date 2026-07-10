import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { severityForStatus } from "../modules/error-events/error-events.policy";

describe("severityForStatus", () => {
  it("maps 4xx to warning", () => {
    assert.equal(severityForStatus(400), "warning");
    assert.equal(severityForStatus(401), "warning");
    assert.equal(severityForStatus(404), "warning");
    assert.equal(severityForStatus(422), "warning");
    assert.equal(severityForStatus(429), "warning");
  });

  it("maps 5xx to error", () => {
    assert.equal(severityForStatus(500), "error");
    assert.equal(severityForStatus(503), "error");
  });
});

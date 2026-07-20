import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchOfflineMutation } from "./route-match";

describe("matchOfflineMutation", () => {
  it("matches patient status patch", () => {
    assert.deepEqual(
      matchOfflineMutation("PATCH", "/api/patients/abc/status"),
      {
        type: "update_patient_status",
        resourceId: "abc",
        method: "PATCH",
      },
    );
  });

  it("matches tooth put", () => {
    assert.deepEqual(
      matchOfflineMutation("PUT", "/api/patients/p1/teeth/16"),
      {
        type: "update_tooth",
        resourceId: "p1",
        toothFdi: 16,
        method: "PUT",
      },
    );
  });

  it("matches patient put and interaction post", () => {
    assert.equal(
      matchOfflineMutation("PUT", "/api/patients/p1")?.type,
      "update_patient",
    );
    assert.equal(
      matchOfflineMutation("POST", "/api/patients/p1/interactions")?.type,
      "add_interaction",
    );
  });

  it("ignores messaging and inventory writes", () => {
    assert.equal(matchOfflineMutation("POST", "/api/messages"), null);
    assert.equal(matchOfflineMutation("PATCH", "/api/inventory/stock/1"), null);
    assert.equal(matchOfflineMutation("POST", "/api/sync/push"), null);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyOutboxToPatients, applyOutboxToTeeth } from "./optimistic-cache";
import type { OutboxOp } from "./types";

function op(partial: Partial<OutboxOp> & Pick<OutboxOp, "type" | "resourceId" | "payload">): OutboxOp {
  return {
    id: partial.id ?? "1",
    type: partial.type,
    resourceId: partial.resourceId,
    toothFdi: partial.toothFdi,
    baseUpdatedAt: partial.baseUpdatedAt ?? null,
    payload: partial.payload,
    url: partial.url ?? "",
    method: partial.method ?? "PATCH",
    clinicId: partial.clinicId ?? "c1",
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    status: partial.status ?? "pending",
    attempts: partial.attempts ?? 0,
  };
}

describe("optimistic-cache outbox patches", () => {
  it("applies offline status change onto patients list", () => {
    const patients = [
      { id: "p1", name: "A", status: "new_request" },
      { id: "p2", name: "B", status: "diagnostics" },
    ];
    const next = applyOutboxToPatients(patients, [
      op({
        type: "update_patient_status",
        resourceId: "p1",
        payload: { status: "treatment_in_progress" },
      }),
    ]);
    assert.equal(next[0]?.status, "treatment_in_progress");
    assert.equal(next[0]?._offlinePending, true);
    assert.equal(next[1]?.status, "diagnostics");
  });

  it("upserts tooth condition from outbox", () => {
    const teeth = [{ toothFdi: 11, condition: "healthy", patientId: "p1" }];
    const next = applyOutboxToTeeth("p1", teeth, [
      op({
        type: "update_tooth",
        resourceId: "p1",
        toothFdi: 16,
        payload: { condition: "cavity", notes: "deep" },
        method: "PUT",
      }),
    ]);
    assert.equal(next.length, 2);
    const t16 = next.find((t) => t.toothFdi === 16);
    assert.equal(t16?.condition, "cavity");
    assert.equal(t16?.notes, "deep");
  });
});

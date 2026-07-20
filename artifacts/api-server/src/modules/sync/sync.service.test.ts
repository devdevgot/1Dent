import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { ConflictError } from "../../shared/errors";
import { isBaseVersionCurrent } from "../../shared/optimistic-concurrency";

describe("sync conflict policy", () => {
  it("VERSION_CONFLICT carries current entity for client merge UI", () => {
    const current = {
      id: "p1",
      status: "diagnostics",
      updatedAt: new Date("2026-04-01T10:00:00.000Z"),
    };
    const err = new ConflictError(
      "conflict",
      { entity: "patient", current },
      "VERSION_CONFLICT",
    );
    assert.equal(err.statusCode, 409);
    assert.equal(err.code, "VERSION_CONFLICT");
    assert.deepEqual(err.details, { entity: "patient", current });
  });

  it("rejects when admin changed patient while owner was offline", () => {
    const serverUpdatedAt = "2026-04-01T12:00:00.000Z";
    const ownerBase = "2026-04-01T10:00:00.000Z";
    assert.equal(isBaseVersionCurrent(serverUpdatedAt, ownerBase), false);
  });

  it("allows apply when versions match", () => {
    const ts = "2026-04-01T12:00:00.000Z";
    assert.equal(isBaseVersionCurrent(ts, ts), true);
  });

  it("mock verifies ConflictError constructor signature used by sync", () => {
    const throwConflict = mock.fn(() => {
      throw new ConflictError("x", { entity: "tooth", current: { id: "t1" } }, "VERSION_CONFLICT");
    });
    assert.throws(
      () => throwConflict(),
      (err: unknown) =>
        err instanceof ConflictError && err.code === "VERSION_CONFLICT",
    );
  });
});

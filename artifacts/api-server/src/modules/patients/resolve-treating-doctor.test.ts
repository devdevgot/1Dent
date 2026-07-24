import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { latestProcedureDoctorMap } from "./resolve-treating-doctor";

describe("latestProcedureDoctorMap", () => {
  it("returns empty map when no patient ids are provided", async () => {
    const result = await latestProcedureDoctorMap("clinic-1", []);
    assert.equal(result.size, 0);
  });

  it("dedupes empty patient ids without querying", async () => {
    const result = await latestProcedureDoctorMap("clinic-1", ["", ""]);
    assert.equal(result.size, 0);
  });
});

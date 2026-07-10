import assert from "node:assert/strict";
import { compareDoctorCandidates } from "./doctor-ranking.ts";

function candidate(overrides) {
  return {
    id: "doc-1",
    name: "Dr. A",
    specialty: null,
    finalScore: 0.5,
    rankPercent: 50,
    hasCapacity: true,
    nearestSlotMinutes: 60,
    reasons: [],
    ...overrides,
  };
}

const sorted = [
  candidate({ id: "low", rankPercent: 40, finalScore: 0.9 }),
  candidate({ id: "high", rankPercent: 85, finalScore: 0.2 }),
  candidate({ id: "mid", rankPercent: 70, finalScore: 0.8 }),
].sort((a, b) => compareDoctorCandidates(a, b));

assert.deepEqual(
  sorted.map((c) => c.id),
  ["high", "mid", "low"],
  "higher rankPercent should win even when finalScore is lower",
);

const tieBreak = [
  candidate({ id: "busy", rankPercent: 80, hasCapacity: false, finalScore: 0.95 }),
  candidate({ id: "free", rankPercent: 80, hasCapacity: true, finalScore: 0.1 }),
].sort((a, b) => compareDoctorCandidates(a, b));

assert.equal(tieBreak[0].id, "free", "equal rating should prefer doctor with capacity");

const returning = [
  candidate({ id: "top-rated", rankPercent: 95 }),
  candidate({ id: "returning", rankPercent: 60 }),
].sort((a, b) =>
  compareDoctorCandidates(a, b, { returningPatientDoctorId: "returning" }),
);

assert.equal(returning[0].id, "returning", "returning patient doctor stays first");

console.log("doctor-ranking tests passed");

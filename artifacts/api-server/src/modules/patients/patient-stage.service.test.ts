import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import {
  transitionPatientStage,
  PATIENT_STAGE_TRIGGERS,
} from "./patient-stage.service";
import type { PatientStageRepo } from "./patient-stage.service";

type PatientStatus =
  | "new_request"
  | "initial_consultation"
  | "diagnostics"
  | "treatment_assigned"
  | "treatment_in_progress"
  | "payment_processing"
  | "post_op_monitoring"
  | "completed"
  | "repeat_sale"
  | "rejected";

type TestPatient = {
  id: string;
  clinicId: string;
  doctorId: string | null;
  name: string;
  phone: string;
  phoneNormalized: string | null;
  marketingOptOut: boolean;
  iin: string | null;
  dateOfBirth: string | null;
  gender: "male" | "female" | "other" | null;
  source: string;
  status: PatientStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function makePatient(overrides: Partial<TestPatient> = {}): TestPatient {
  return {
    id: "patient-1",
    clinicId: "clinic-1",
    doctorId: null,
    name: "Test Patient",
    phone: "+77001234567",
    phoneNormalized: null,
    marketingOptOut: false,
    iin: null,
    dateOfBirth: null,
    gender: null,
    source: "other",
    status: "new_request",
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function createMockRepo(overrides: Partial<PatientStageRepo> = {}): PatientStageRepo {
  return {
    findById: mock.fn(async () => undefined),
    updateStatus: mock.fn(async () => undefined),
    createInteraction: mock.fn(async () => ({
      id: "interaction-1",
      patientId: "patient-1",
      clinicId: "clinic-1",
      userId: null,
      type: "status_change" as const,
      content: "",
      createdAt: new Date(),
    })),
    ...overrides,
  };
}

describe("transitionPatientStage", () => {
  it("returns changed:false when already at target status", async () => {
    const patient = makePatient({ status: "initial_consultation" });
    const repo = createMockRepo({
      findById: mock.fn(async () => patient),
      updateStatus: mock.fn(async () => patient),
      createInteraction: mock.fn(async () => ({
        id: "interaction-1",
        patientId: patient.id,
        clinicId: patient.clinicId,
        userId: null,
        type: "status_change" as const,
        content: "",
        createdAt: new Date(),
      })),
    });

    const result = await transitionPatientStage({
      patientId: patient.id,
      clinicId: patient.clinicId,
      toStatus: "initial_consultation",
      trigger: PATIENT_STAGE_TRIGGERS.APPOINTMENT_CREATED,
      repo,
    });

    assert.equal(result.changed, false);
    assert.equal(result.from, "initial_consultation");
    assert.equal(result.to, "initial_consultation");
    assert.equal((repo.findById as ReturnType<typeof mock.fn>).mock.callCount(), 1);
    assert.equal((repo.updateStatus as ReturnType<typeof mock.fn>).mock.callCount(), 0);
    assert.equal((repo.createInteraction as ReturnType<typeof mock.fn>).mock.callCount(), 0);
  });

  it("calls updateStatus and logs interaction when status differs", async () => {
    const existing = makePatient({ status: "new_request" });
    const updated = makePatient({ status: "initial_consultation" });
    const repo = createMockRepo({
      findById: mock.fn(async () => existing),
      updateStatus: mock.fn(async () => updated),
      createInteraction: mock.fn(async () => ({
        id: "interaction-1",
        patientId: existing.id,
        clinicId: existing.clinicId,
        userId: "user-1",
        type: "status_change" as const,
        content: "new_request → initial_consultation (appointment_created)",
        createdAt: new Date(),
      })),
    });

    const result = await transitionPatientStage({
      patientId: existing.id,
      clinicId: existing.clinicId,
      toStatus: "initial_consultation",
      trigger: PATIENT_STAGE_TRIGGERS.APPOINTMENT_CREATED,
      actorId: "user-1",
      repo,
    });

    assert.equal(result.changed, true);
    assert.equal(result.from, "new_request");
    assert.equal(result.to, "initial_consultation");
    assert.equal((repo.updateStatus as ReturnType<typeof mock.fn>).mock.callCount(), 1);
    assert.deepEqual(
      (repo.updateStatus as ReturnType<typeof mock.fn>).mock.calls[0]?.arguments,
      [existing.id, existing.clinicId, "initial_consultation"],
    );
    assert.equal((repo.createInteraction as ReturnType<typeof mock.fn>).mock.callCount(), 1);
    assert.equal(
      (repo.createInteraction as ReturnType<typeof mock.fn>).mock.calls[0]?.arguments[0]?.content,
      "new_request → initial_consultation (appointment_created)",
    );
  });

  it("handles missing patient gracefully", async () => {
    const repo = createMockRepo({
      findById: mock.fn(async () => undefined),
    });

    const result = await transitionPatientStage({
      patientId: "missing-patient",
      clinicId: "clinic-1",
      toStatus: "diagnostics",
      trigger: PATIENT_STAGE_TRIGGERS.DIAGNOSIS_STARTED,
      repo,
    });

    assert.equal(result.changed, false);
    assert.equal(result.from, null);
    assert.equal(result.to, "diagnostics");
    assert.equal((repo.updateStatus as ReturnType<typeof mock.fn>).mock.callCount(), 0);
  });
});

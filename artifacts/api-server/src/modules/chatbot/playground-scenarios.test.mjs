import { describe, it } from "node:test";
import assert from "node:assert/strict";

const PLAYGROUND_SCENARIO_LABELS = {
  new_patient: "Новый пациент",
  returning_no_appt: "Постоянный клиент (без записи)",
  returning_with_appt: "Есть предстоящая запись",
  wants_existing_appt: "«Моя запись» (новый номер)",
  post_op_monitoring: "После операции",
  repeat_sale: "Повторная продажа",
  reactivation: "Реактивация no-show",
};

function buildScenarioContext(scenario, doctorsWithSlots) {
  const doctor = doctorsWithSlots[0];
  const doctorId = doctor?.id ?? "sim-doctor-id";
  const doctorName = doctor?.name ?? "Иван Петров";
  const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const basePatient = {
    id: "sim-patient-id",
    name: "Айгуль",
    phone: "+77000000001",
    status: "initial_consultation",
    doctorId,
  };
  switch (scenario) {
    case "returning_no_appt":
      return { patient: basePatient, upcomingProcedure: null };
    case "returning_with_appt":
      return {
        patient: basePatient,
        upcomingProcedure: {
          id: "sim-procedure-id",
          scheduledAt: futureDate,
          doctorId,
          doctorName,
        },
      };
    default:
      return { patient: null, upcomingProcedure: null };
  }
}

function getInitialSessionForScenario(scenario) {
  if (scenario === "reactivation") {
    return { state: "reactivation", data: { patientName: "Айгуль" } };
  }
  return { state: "greeting", data: {} };
}

describe("playground-scenarios", () => {
  it("builds returning patient with appointment", () => {
    const ctx = buildScenarioContext("returning_with_appt", [
      { id: "doc-1", name: "Dr. A", specialty: null, slots: [] },
    ]);
    assert.ok(ctx.patient);
    assert.ok(ctx.upcomingProcedure);
    assert.equal(ctx.upcomingProcedure.doctorName, "Dr. A");
  });

  it("reactivation starts in reactivation state", () => {
    const session = getInitialSessionForScenario("reactivation");
    assert.equal(session.state, "reactivation");
  });

  it("labels cover all scenarios", () => {
    assert.equal(Object.keys(PLAYGROUND_SCENARIO_LABELS).length, 7);
  });
});

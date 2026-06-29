import type { ChatbotState, ChatbotSessionData } from "./chatbot.types";
import type { DoctorWithSlots } from "./chatbot.service.types";

export const PLAYGROUND_SIM_PHONE = "+77000000001";

export type PlaygroundScenario =
  | "new_patient"
  | "returning_no_appt"
  | "returning_with_appt"
  | "wants_existing_appt"
  | "post_op_monitoring"
  | "repeat_sale"
  | "reactivation";

export interface ScenarioPatient {
  id: string;
  name: string;
  phone: string;
  status: string;
  doctorId?: string;
}

export interface ScenarioUpcomingProcedure {
  id: string;
  scheduledAt: Date;
  doctorId: string;
  doctorName: string;
}

export interface ScenarioContext {
  patient: ScenarioPatient | null;
  upcomingProcedure: ScenarioUpcomingProcedure | null;
}

export interface PlaygroundSessionInput {
  state: ChatbotState;
  data: ChatbotSessionData;
  humanTakeover?: boolean;
}

export function buildScenarioContext(
  scenario: PlaygroundScenario | undefined,
  doctorsWithSlots: DoctorWithSlots[],
): ScenarioContext {
  const doctor = doctorsWithSlots[0];
  const doctorId = doctor?.id ?? "sim-doctor-id";
  const doctorName = doctor?.name ?? "Иван Петров";
  const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  const basePatient: ScenarioPatient = {
    id: "sim-patient-id",
    name: "Айгуль",
    phone: PLAYGROUND_SIM_PHONE,
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
    case "post_op_monitoring":
      return {
        patient: { ...basePatient, status: "post_op_monitoring" },
        upcomingProcedure: null,
      };
    case "repeat_sale":
      return {
        patient: { ...basePatient, status: "repeat_sale" },
        upcomingProcedure: null,
      };
    case "wants_existing_appt":
    case "new_patient":
    default:
      return { patient: null, upcomingProcedure: null };
  }
}

export function getInitialSessionForScenario(scenario?: PlaygroundScenario): PlaygroundSessionInput {
  if (scenario === "reactivation") {
    return {
      state: "reactivation",
      data: {
        patientName: "Айгуль",
        existingPatientId: "sim-patient-id",
        suggestedDoctorName: "Иван Петров",
        problemDescription: "Консультация",
      },
      humanTakeover: false,
    };
  }
  return { state: "greeting", data: {}, humanTakeover: false };
}

export const PLAYGROUND_SCENARIO_LABELS: Record<PlaygroundScenario, string> = {
  new_patient: "Новый пациент",
  returning_no_appt: "Постоянный клиент (без записи)",
  returning_with_appt: "Есть предстоящая запись",
  wants_existing_appt: "«Моя запись» (новый номер)",
  post_op_monitoring: "После операции",
  repeat_sale: "Повторная продажа",
  reactivation: "Реактивация no-show",
};

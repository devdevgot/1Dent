export type ChatbotState =
  | "greeting"
  | "collect_name"
  | "collect_problem"
  | "suggest_doctor"
  | "confirm_appointment"
  | "done"
  | "human_takeover";

export interface ChatbotSessionData {
  patientName?: string;
  problemDescription?: string;
  suggestedDoctorId?: string;
  suggestedDoctorName?: string;
  createdPatientId?: string;
}

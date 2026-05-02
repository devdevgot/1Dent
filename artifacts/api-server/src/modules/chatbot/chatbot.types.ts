export type ChatbotState =
  | "greeting"
  | "collect_iin"
  | "collect_name"
  | "collect_phone"
  | "collect_problem"
  | "suggest_doctor"
  | "manage_appointment"
  | "show_slots"
  | "collect_datetime"
  | "confirm_appointment"
  | "dental_qa"
  | "done"
  | "human_takeover";

export interface ChatbotSessionData {
  patientName?: string;
  problemDescription?: string;
  suggestedDoctorId?: string;
  suggestedDoctorName?: string;
  createdPatientId?: string;
  confusedCount?: number;
  refCode?: string;
  channelId?: string;
  clickId?: string;
  extractedPhone?: string;
  existingPatientId?: string;
  collectedIin?: string;
  collectedPhone?: string;
  preferredDatetime?: string;
  // Existing appointment management
  existingProcedureId?: string;
  existingProcedureDate?: string;
  existingProcedureDoctorName?: string;
  isReschedule?: boolean;
  // AI classification results
  serviceType?: string;
  urgency?: string;
  patientType?: string;
  aiConfidence?: string;
}

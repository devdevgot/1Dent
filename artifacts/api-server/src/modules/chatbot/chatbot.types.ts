export type ChatbotState =
  | "greeting"
  | "collect_iin"
  | "collect_name"
  | "collect_problem"
  | "suggest_doctor"
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
  // AI classification results
  serviceType?: string;
  urgency?: string;
  patientType?: string;
  aiConfidence?: string;
}

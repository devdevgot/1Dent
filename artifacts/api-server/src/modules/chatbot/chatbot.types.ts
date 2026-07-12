export type ChatbotState =
  | "greeting"
  | "collect_iin"
  | "collect_name"
  | "collect_phone"
  | "collect_problem"
  | "collect_qualification"
  | "suggest_doctor"
  | "manage_appointment"
  | "show_slots"
  | "collect_datetime"
  | "collect_branch"
  | "await_decision"
  | "handle_objections"
  | "confirm_appointment"
  | "dental_qa"
  | "collect_review"
  | "done"
  | "human_takeover"
  | "reactivation";

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
  selectedBranch?: string;
  inactivityReminderSent?: boolean;
  existingProcedureId?: string;
  existingProcedureDate?: string;
  existingProcedureDoctorName?: string;
  isReschedule?: boolean;
  serviceType?: string;
  urgency?: string;
  patientType?: string;
  aiConfidence?: string;
  activeMindMapNodeId?: string;
  qualificationAsked?: boolean;
  qualificationPhase?: "symptoms" | "branch";
  objectionsHandled?: boolean;
  decisionOutcome?: "ready" | "hesitating" | "refused";
  objectionType?: "price" | "fear" | "info";
  returningDoctorId?: string;
  doctorCandidates?: Array<{
    id: string;
    name: string;
    score: number;
    finalScore?: number;
    reasons?: string[];
    specialty?: string | null;
  }>;
  doctorPickReason?: string;
  doctorRankPercent?: number;
  doctorConfirmed?: boolean;
  excludedDoctorIds?: string[];
  leadNurtureAnchorAt?: string;
  leadFollowup24Sent?: boolean;
  leadFollowup72Sent?: boolean;
  leadFollowup168Sent?: boolean;
  branchAskCount?: number;
  handoffSummary?: string;
  createdProcedureId?: string;
  abVariantId?: string;
  fromRepeatSaleBroadcast?: boolean;
  pendingReviewProcedureId?: string;
  pendingReviewDoctorId?: string;
  /** ISO timestamp when humanTakeover was activated (for auto-resume). */
  takeoverAt?: string;
}

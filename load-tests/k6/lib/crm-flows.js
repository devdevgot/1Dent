import { group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { get, post, patch, assertOk, todayRange, randomPhone, randomName, jsonOrNull } from "./helpers.js";

export const endpointFail = new Rate("endpoint_fail_rate");
export const dashboardDuration = new Trend("dashboard_batch_duration", true);
export const patientsDuration = new Trend("patients_list_duration", true);
export const calendarDuration = new Trend("calendar_batch_duration", true);
export const analyticsDuration = new Trend("analytics_batch_duration", true);
export const writeDuration = new Trend("write_ops_duration", true);

function track(res, name) {
  const ok = assertOk(res, name);
  endpointFail.add(!ok);
  return ok;
}

/** Owner dashboard mount — mirrors FE fan-out. */
export function browseDashboard(token) {
  const start = Date.now();
  group("crm_dashboard", () => {
    const range = todayRange();
    const qs = `dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`;
    const r1 = get(`/api/analytics/owner/summary?${qs}`, token, { endpoint: "analytics_owner_summary" });
    track(r1, "owner_summary");
    const r2 = get(`/api/analytics?${qs}`, token, { endpoint: "analytics" });
    track(r2, "analytics");
    const r3 = get("/api/notifications/unread-count", token, { endpoint: "notifications_unread" });
    track(r3, "notifications_unread");
    const r4 = get("/api/auth/me", token, { endpoint: "auth_me" });
    track(r4, "auth_me");
    const r5 = get("/api/channels/stats", token, { endpoint: "channels_stats" });
    track(r5, "channels_stats");
    const r6 = get("/api/kpi/doctors", token, { endpoint: "kpi_doctors" });
    track(r6, "kpi_doctors");
  });
  dashboardDuration.add(Date.now() - start);
  sleep(0.3);
}

/** Patients / kanban list views. */
export function browsePatients(token) {
  const start = Date.now();
  group("crm_patients", () => {
    const r1 = get("/api/patients", token, { endpoint: "patients_list" });
    track(r1, "patients_list");
    const r2 = get("/api/patients/treatment-progress", token, { endpoint: "patients_treatment_progress" });
    track(r2, "treatment_progress");
    const r3 = get("/api/patients/condition-stats", token, { endpoint: "patients_condition_stats" });
    track(r3, "condition_stats");
    const r4 = get("/api/chat-sessions/active", token, { endpoint: "chat_sessions_active" });
    track(r4, "chat_sessions_active");
    const r5 = get("/api/patients/financial-summary", token, { endpoint: "patients_financial_summary" });
    track(r5, "financial_summary");

    const body = jsonOrNull(r1);
    const patients = body?.data?.patients || [];
    if (patients.length > 0) {
      const id = patients[Math.floor(Math.random() * Math.min(patients.length, 20))].id;
      const r6 = get(`/api/patients/${id}`, token, { endpoint: "patient_detail" });
      track(r6, "patient_detail");
      const r7 = get(`/api/patients/${id}/treatment-plans`, token, { endpoint: "patient_treatment_plans" });
      track(r7, "treatment_plans");
      const r8 = get(`/api/patients/${id}/messages`, token, { endpoint: "patient_messages" });
      track(r8, "patient_messages");
    }
  });
  patientsDuration.add(Date.now() - start);
  sleep(0.3);
}

/** Calendar / procedures. */
export function browseCalendar(token) {
  const start = Date.now();
  group("crm_calendar", () => {
    const range = todayRange();
    const r1 = get(
      `/api/procedures?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`,
      token,
      { endpoint: "procedures_list" },
    );
    track(r1, "procedures_list");
    const r2 = get("/api/procedures/templates", token, { endpoint: "procedures_templates" });
    track(r2, "procedures_templates");
    const r3 = get("/api/patients", token, { endpoint: "patients_list" });
    track(r3, "patients_for_calendar");
    const r4 = get("/api/users", token, { endpoint: "users_list" });
    track(r4, "users_list");
    const r5 = get("/api/followups", token, { endpoint: "followups_list" });
    track(r5, "followups_list");
  });
  calendarDuration.add(Date.now() - start);
  sleep(0.3);
}

/** Analytics deep pages. */
export function browseAnalytics(token) {
  const start = Date.now();
  group("crm_analytics", () => {
    const range = todayRange();
    const qs = `dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`;
    const r1 = get(`/api/analytics/owner?${qs}`, token, { endpoint: "analytics_owner" });
    track(r1, "analytics_owner");
    const r2 = get(`/api/analytics/patient-metrics?${qs}`, token, { endpoint: "analytics_patient_metrics" });
    track(r2, "patient_metrics");
    const r3 = get(`/api/analytics/financial-summary?${qs}`, token, { endpoint: "analytics_financial" });
    track(r3, "financial_summary");
    const r4 = get("/api/chatbot/analytics/funnel", token, { endpoint: "chatbot_funnel" });
    track(r4, "chatbot_funnel");
    const r5 = get("/api/chatbot/settings", token, { endpoint: "chatbot_settings" });
    track(r5, "chatbot_settings");
    const r6 = get("/api/chatbot/sessions", token, { endpoint: "chatbot_sessions" });
    track(r6, "chatbot_sessions");
  });
  analyticsDuration.add(Date.now() - start);
  sleep(0.3);
}

/** Contracts + tablet authenticated reads. */
export function browseContractsAndTablet(token) {
  group("crm_contracts_tablet", () => {
    track(get("/api/contracts/templates", token, { endpoint: "contracts_templates" }), "contracts_templates");
    track(get("/api/clinic/contract-settings", token, { endpoint: "contract_settings" }), "contract_settings");
    track(get("/api/tablet/cabinets", token, { endpoint: "tablet_cabinets" }), "tablet_cabinets");
    track(get("/api/tablet/me", token, { endpoint: "tablet_me" }), "tablet_me");
    track(get("/api/tablet/pending-pairing", token, { endpoint: "tablet_pending" }), "tablet_pending");
  });
  sleep(0.2);
}

/** Write path: create patient + note + optional procedure. */
export function writePatientFlow(token) {
  const start = Date.now();
  group("crm_write", () => {
    const createRes = post(
      "/api/patients",
      {
        name: randomName(),
        phone: randomPhone(),
        source: "other",
        notes: "k6 load test patient",
      },
      token,
      { endpoint: "patients_create" },
    );
    track(createRes, "patients_create");
    const created = jsonOrNull(createRes);
    const patientId = created?.data?.patient?.id || created?.data?.id;

    if (patientId) {
      const noteRes = post(
        `/api/patients/${patientId}/interactions`,
        { type: "note", content: `k6 note ${Date.now()}` },
        token,
        { endpoint: "patients_interaction" },
      );
      track(noteRes, "patients_interaction");

      const statusRes = patch(
        `/api/patients/${patientId}/status`,
        { status: "initial_consultation" },
        token,
        { endpoint: "patients_status" },
      );
      track(statusRes, "patients_status");

      const procRes = post(
        "/api/procedures",
        {
          patientId,
          name: "Консультация (k6)",
          price: 5000,
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        },
        token,
        { endpoint: "procedures_create" },
      );
      track(procRes, "procedures_create");
    }
  });
  writeDuration.add(Date.now() - start);
  sleep(0.5);
}

/** Public / unauthenticated surfaces. */
export function hitPublicSurfaces() {
  group("public_surfaces", () => {
    const health = get("/api/healthz", "", { endpoint: "healthz" });
    // get() always sends Authorization; use raw for public
    track(health, "healthz");
  });
}

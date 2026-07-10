import { getBaseUrl } from "@/lib/base-url";

export interface LandingLeadPayload {
  name: string;
  phone: string;
  clinicName: string;
}

export async function submitLandingLead(payload: LandingLeadPayload): Promise<{ id: string }> {
  const res = await fetch(`${getBaseUrl()}/api/landing-leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = typeof json?.error === "string" ? json.error : "Не удалось отправить заявку";
    throw new Error(message);
  }

  return json.data;
}

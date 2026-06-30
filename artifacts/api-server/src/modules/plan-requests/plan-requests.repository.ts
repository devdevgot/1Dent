import { randomUUID } from "crypto";
import { pool } from "@workspace/db";

export interface CreatePlanRequestInput {
  plan: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  message?: string;
}

export class PlanRequestsRepository {
  async create(clinicId: string, input: CreatePlanRequestInput): Promise<{ id: string }> {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO plan_requests (id, clinic_id, plan, contact_name, contact_phone, contact_email, message) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        clinicId,
        input.plan,
        input.contactName,
        input.contactPhone,
        input.contactEmail ?? null,
        input.message ?? null,
      ],
    );
    return { id };
  }
}

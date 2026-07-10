import { randomUUID } from "crypto";
import { pool } from "@workspace/db";

export interface CreateLandingLeadInput {
  name: string;
  phone: string;
  clinicName: string;
  source?: string;
}

export class LandingLeadsRepository {
  async create(input: CreateLandingLeadInput): Promise<{ id: string }> {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO landing_leads (id, name, phone, clinic_name, source) VALUES ($1, $2, $3, $4, $5)`,
      [id, input.name, input.phone, input.clinicName, input.source ?? "landing"],
    );
    return { id };
  }
}

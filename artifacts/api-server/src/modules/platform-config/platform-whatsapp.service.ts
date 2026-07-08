import { randomUUID } from "crypto";
import { platformConfigService } from "./platform-config.service";
import { db, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "whatsapp_instances";

export interface PlatformWhatsappInstance {
  id: string;
  label: string;
  greenApiInstanceId: string;
  greenApiToken: string;
  greenApiUrl: string | null;
  whatsappPhone: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface PlatformWhatsappConfig {
  instances: PlatformWhatsappInstance[];
}

function emptyConfig(): PlatformWhatsappConfig {
  return { instances: [] };
}

async function readConfig(): Promise<PlatformWhatsappConfig> {
  const [row] = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, SETTINGS_KEY))
    .limit(1);

  if (!row?.value || typeof row.value !== "object") {
    return emptyConfig();
  }

  const raw = row.value as Partial<PlatformWhatsappConfig>;
  return {
    instances: Array.isArray(raw.instances) ? raw.instances : [],
  };
}

async function writeConfig(config: PlatformWhatsappConfig): Promise<PlatformWhatsappConfig> {
  await db
    .insert(platformSettingsTable)
    .values({ key: SETTINGS_KEY, value: config, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettingsTable.key,
      set: { value: config, updatedAt: new Date() },
    });
  return config;
}

function normalizeDefault(instances: PlatformWhatsappInstance[]): PlatformWhatsappInstance[] {
  if (instances.length === 0) return instances;
  const hasDefault = instances.some((i) => i.isDefault);
  if (hasDefault) return instances;
  return instances.map((inst, idx) => ({ ...inst, isDefault: idx === 0 }));
}

export class PlatformWhatsappService {
  async listInstances(): Promise<PlatformWhatsappInstance[]> {
    const config = await readConfig();
    return normalizeDefault(config.instances);
  }

  async getInstanceById(id: string): Promise<PlatformWhatsappInstance | null> {
    const instances = await this.listInstances();
    return instances.find((i) => i.id === id) ?? null;
  }

  async getDefaultInstance(): Promise<PlatformWhatsappInstance | null> {
    const instances = await this.listInstances();
    return instances.find((i) => i.isDefault) ?? instances[0] ?? null;
  }

  async addInstance(data: {
    label: string;
    greenApiInstanceId: string;
    greenApiToken: string;
    greenApiUrl?: string | null;
    whatsappPhone?: string | null;
    isDefault?: boolean;
  }): Promise<PlatformWhatsappInstance> {
    const config = await readConfig();
    const instance: PlatformWhatsappInstance = {
      id: randomUUID(),
      label: data.label.trim() || "1Dent WhatsApp",
      greenApiInstanceId: data.greenApiInstanceId.trim(),
      greenApiToken: data.greenApiToken.trim(),
      greenApiUrl: data.greenApiUrl?.trim() || null,
      whatsappPhone: data.whatsappPhone?.replace(/\D/g, "") || null,
      isDefault: data.isDefault ?? config.instances.length === 0,
      createdAt: new Date().toISOString(),
    };

    let instances = [...config.instances, instance];
    if (instance.isDefault) {
      instances = instances.map((i) => ({ ...i, isDefault: i.id === instance.id }));
    }

    await writeConfig({ instances: normalizeDefault(instances) });
    return instance;
  }

  async updateInstance(
    id: string,
    patch: Partial<
      Pick<
        PlatformWhatsappInstance,
        "label" | "greenApiInstanceId" | "greenApiToken" | "greenApiUrl" | "whatsappPhone" | "isDefault"
      >
    >,
  ): Promise<PlatformWhatsappInstance> {
    const config = await readConfig();
    const idx = config.instances.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error("Instance not found");

    const current = config.instances[idx]!;
    const updated: PlatformWhatsappInstance = {
      ...current,
      ...patch,
      label: patch.label?.trim() || current.label,
      greenApiInstanceId: patch.greenApiInstanceId?.trim() || current.greenApiInstanceId,
      greenApiToken: patch.greenApiToken?.trim() || current.greenApiToken,
      greenApiUrl: patch.greenApiUrl !== undefined ? (patch.greenApiUrl?.trim() || null) : current.greenApiUrl,
      whatsappPhone:
        patch.whatsappPhone !== undefined
          ? patch.whatsappPhone?.replace(/\D/g, "") || null
          : current.whatsappPhone,
    };

    let instances = [...config.instances];
    instances[idx] = updated;

    if (patch.isDefault) {
      instances = instances.map((i) => ({ ...i, isDefault: i.id === id }));
    }

    await writeConfig({ instances: normalizeDefault(instances) });
    return updated;
  }

  async deleteInstance(id: string): Promise<void> {
    const config = await readConfig();
    const instances = config.instances.filter((i) => i.id !== id);
    await writeConfig({ instances: normalizeDefault(instances) });
  }

  /** Warm cache hook for server startup (no-op for DB-backed config). */
  async warmCache(): Promise<void> {
    await this.listInstances();
    void platformConfigService;
  }
}

export const platformWhatsappService = new PlatformWhatsappService();

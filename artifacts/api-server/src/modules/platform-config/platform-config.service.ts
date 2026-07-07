import { eq } from "drizzle-orm";
import { db, platformSettingsTable, chatbotSettingsTable, clinicsTable } from "@workspace/db";
import {
  DEFAULT_CHATBOT_DEFAULTS,
  DEFAULT_PLATFORM_PLANS,
  buildDefaultContractTemplatesConfig,
  type PlatformChatbotDefaults,
  type PlatformContractTemplatesConfig,
  type PlatformPlansConfig,
} from "./platform-config.defaults";
import { seedAllClinicsContractTemplates } from "../../seeds/contract-templates.seed";

const KEYS = {
  plans: "plans",
  chatbotDefaults: "chatbot_defaults",
  contractTemplates: "contract_templates",
} as const;

let plansCache: PlatformPlansConfig = DEFAULT_PLATFORM_PLANS;
let chatbotDefaultsCache: PlatformChatbotDefaults = DEFAULT_CHATBOT_DEFAULTS;

export function getCachedPlansConfig(): PlatformPlansConfig {
  return plansCache;
}

export function getCachedChatbotDefaults(): PlatformChatbotDefaults {
  return chatbotDefaultsCache;
}

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, key))
    .limit(1);
  if (!row?.value) return fallback;
  return { ...fallback, ...(row.value as object) } as T;
}

async function writeSetting<T extends object>(key: string, value: T): Promise<T> {
  const [row] = await db
    .insert(platformSettingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettingsTable.key,
      set: { value, updatedAt: new Date() },
    })
    .returning();
  return row!.value as T;
}

export class PlatformConfigService {
  async warmCache(): Promise<void> {
    plansCache = await this.getPlansConfig();
    chatbotDefaultsCache = await this.getChatbotDefaults();
  }

  async getPlansConfig(): Promise<PlatformPlansConfig> {
    const stored = await readSetting(KEYS.plans, DEFAULT_PLATFORM_PLANS);
    plansCache = {
      ...DEFAULT_PLATFORM_PLANS,
      ...stored,
      plans: stored.plans?.length ? stored.plans : DEFAULT_PLATFORM_PLANS.plans,
    };
    return plansCache;
  }

  async updatePlansConfig(patch: Partial<PlatformPlansConfig>): Promise<PlatformPlansConfig> {
    const current = await this.getPlansConfig();
    const next: PlatformPlansConfig = {
      implementationFee: patch.implementationFee ?? current.implementationFee,
      trialDays: patch.trialDays ?? current.trialDays,
      plans: patch.plans ?? current.plans,
    };
    await writeSetting(KEYS.plans, next);
    plansCache = next;
    return next;
  }

  async getChatbotDefaults(): Promise<PlatformChatbotDefaults> {
    chatbotDefaultsCache = await readSetting(KEYS.chatbotDefaults, DEFAULT_CHATBOT_DEFAULTS);
    return chatbotDefaultsCache;
  }

  async updateChatbotDefaults(patch: Partial<PlatformChatbotDefaults>): Promise<PlatformChatbotDefaults> {
    const current = await this.getChatbotDefaults();
    const next = { ...current, ...patch };
    await writeSetting(KEYS.chatbotDefaults, next);
    chatbotDefaultsCache = next;
    return next;
  }

  async applyChatbotDefaultsToAllClinics(): Promise<{ updated: number }> {
    const defaults = await this.getChatbotDefaults();
    const clinics = await db.select({ id: clinicsTable.id }).from(clinicsTable);
    let updated = 0;
    for (const clinic of clinics) {
      const [existing] = await db
        .select({ id: chatbotSettingsTable.id })
        .from(chatbotSettingsTable)
        .where(eq(chatbotSettingsTable.clinicId, clinic.id))
        .limit(1);
      if (existing) {
        await db
          .update(chatbotSettingsTable)
          .set({
            greetingTemplate: defaults.greetingTemplate,
            followup24hTemplate: defaults.followup24hTemplate,
            followup72hTemplate: defaults.followup72hTemplate,
            followup168hTemplate: defaults.followup168hTemplate,
            updatedAt: new Date(),
          })
          .where(eq(chatbotSettingsTable.clinicId, clinic.id));
      }
      updated++;
    }
    return { updated };
  }

  async getContractTemplatesConfig(): Promise<PlatformContractTemplatesConfig> {
    const stored = await readSetting(KEYS.contractTemplates, buildDefaultContractTemplatesConfig());
    if (!stored.templates?.length) {
      return buildDefaultContractTemplatesConfig();
    }
    const defaults = buildDefaultContractTemplatesConfig();
    const byId = new Map(stored.templates.map((t) => [t.id, t]));
    return {
      templates: defaults.templates.map((t) => ({
        ...t,
        ...(byId.get(t.id) ?? {}),
        name: byId.get(t.id)?.name ?? t.name,
        enabled: byId.get(t.id)?.enabled ?? t.enabled,
      })),
    };
  }

  async updateContractTemplatesConfig(
    patch: PlatformContractTemplatesConfig,
  ): Promise<PlatformContractTemplatesConfig> {
    await writeSetting(KEYS.contractTemplates, patch);
    return patch;
  }

  async reseedAllContractTemplates(): Promise<{ clinics: number }> {
    await seedAllClinicsContractTemplates();
    const clinics = await db.select({ id: clinicsTable.id }).from(clinicsTable);
    return { clinics: clinics.length };
  }
}

export const platformConfigService = new PlatformConfigService();

export function chatbotDefaultsForNewClinic(): Pick<
  PlatformChatbotDefaults,
  "greetingTemplate" | "followup24hTemplate" | "followup72hTemplate" | "followup168hTemplate"
> & { enabled: boolean } {
  const d = getCachedChatbotDefaults();
  return {
    enabled: d.defaultEnabled,
    greetingTemplate: d.greetingTemplate,
    followup24hTemplate: d.followup24hTemplate,
    followup72hTemplate: d.followup72hTemplate,
    followup168hTemplate: d.followup168hTemplate,
  };
}

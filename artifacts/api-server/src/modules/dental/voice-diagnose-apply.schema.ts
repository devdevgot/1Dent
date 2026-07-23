import { z } from "zod";

export const VOICE_APPLY_MAX_ENTRIES = 32;

const toothConditionValues = [
  "healthy",
  "cavity",
  "treated",
  "crown",
  "root_canal",
  "implant",
  "missing",
  "extraction_needed",
] as const;

export const voiceApplyBodySchema = z.object({
  entries: z
    .array(
      z.object({
        fdi: z.number().int().min(11).max(48),
        condition: z.enum(toothConditionValues),
        notes: z.string().optional(),
        mkb10Code: z.string().optional(),
      }),
    )
    .min(1)
    .max(VOICE_APPLY_MAX_ENTRIES),
  services: z
    .array(
      z.object({
        fdi: z.number().int().min(11).max(48),
        templateId: z.string().min(1),
      }),
    )
    .max(VOICE_APPLY_MAX_ENTRIES)
    .default([]),
  activePlanId: z.string().min(1).optional(),
});

export type VoiceApplyBody = z.infer<typeof voiceApplyBodySchema>;

export type VoiceApplyError = {
  fdi: number;
  kind: "tooth" | "service" | "planItem";
  message: string;
};

export type VoiceApplyResult = {
  appliedTeeth: number;
  appliedServices: number;
  appliedFdis: number[];
  errors: VoiceApplyError[];
};

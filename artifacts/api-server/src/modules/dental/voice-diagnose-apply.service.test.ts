import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  voiceApplyBodySchema,
  VOICE_APPLY_MAX_ENTRIES,
} from "./voice-diagnose-apply.schema";

describe("voice-diagnose apply body schema", () => {
  it("accepts a valid bulk apply payload", () => {
    const parsed = voiceApplyBodySchema.safeParse({
      entries: [
        { fdi: 16, condition: "cavity", notes: "глубокий" },
        { fdi: 26, condition: "crown", mkb10Code: "K02.1" },
      ],
      services: [{ fdi: 16, templateId: "tpl-1" }],
      activePlanId: "plan-1",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.entries.length, 2);
      assert.equal(parsed.data.services.length, 1);
      assert.equal(parsed.data.activePlanId, "plan-1");
    }
  });

  it("defaults services to an empty array", () => {
    const parsed = voiceApplyBodySchema.safeParse({
      entries: [{ fdi: 11, condition: "cavity" }],
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.deepEqual(parsed.data.services, []);
    }
  });

  it("rejects empty entries and invalid FDI", () => {
    assert.equal(voiceApplyBodySchema.safeParse({ entries: [] }).success, false);
    assert.equal(
      voiceApplyBodySchema.safeParse({
        entries: [{ fdi: 99, condition: "cavity" }],
      }).success,
      false,
    );
  });

  it("rejects more than VOICE_APPLY_MAX_ENTRIES teeth", () => {
    const entries = Array.from({ length: VOICE_APPLY_MAX_ENTRIES + 1 }, (_, i) => ({
      fdi: 11 + (i % 8),
      condition: "cavity" as const,
    }));
    assert.equal(voiceApplyBodySchema.safeParse({ entries }).success, false);
  });

  it("rejects unknown tooth conditions", () => {
    assert.equal(
      voiceApplyBodySchema.safeParse({
        entries: [{ fdi: 16, condition: "pulpitis" }],
      }).success,
      false,
    );
  });
});

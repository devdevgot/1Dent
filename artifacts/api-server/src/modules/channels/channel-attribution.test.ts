import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWhatsAppPrefillText,
  extractClickId,
  extractRefCode,
  isGenericPatientSource,
  patientMatchesChannelSource,
  patientSourceFromRefCode,
} from "./channel-attribution";

describe("channel attribution tokens", () => {
  it("builds prefill text with compact tokens on a second line", () => {
    const text = buildWhatsAppPrefillText("a1b2", "550e8400-e29b-41d4-a716-446655440000");
    assert.match(text, /^Здравствуйте, хочу записаться на приём 👋\n/);
    assert.match(text, /\(ref:a1b2 cid:550e8400-e29b-41d4-a716-446655440000\)$/);
  });

  it("extracts ref code and click id from inbound WhatsApp text", () => {
    const text = buildWhatsAppPrefillText("Ab12", "550e8400-e29b-41d4-a716-446655440000");
    assert.equal(extractRefCode(text), "ab12");
    assert.equal(extractClickId(text), "550e8400-e29b-41d4-a716-446655440000");
  });

  it("extracts tokens from the legacy single-line format", () => {
    const text = "Здравствуйте, хочу записаться на приём 👋 (ref:dead cid:550e8400-e29b-41d4-a716-446655440000)";
    assert.equal(extractRefCode(text), "dead");
    assert.equal(extractClickId(text), "550e8400-e29b-41d4-a716-446655440000");
  });

  it("returns null when tokens are missing", () => {
    assert.equal(extractRefCode("Здравствуйте"), null);
    assert.equal(extractClickId("Здравствуйте"), null);
  });

  it("builds canonical patient source and matches analytics formats", () => {
    assert.equal(patientSourceFromRefCode("Ab12"), "ref:ab12");
    assert.equal(patientMatchesChannelSource("ref:ab12", "ab12", "ch-1"), true);
    assert.equal(patientMatchesChannelSource("ab12", "ab12", "ch-1"), true);
    assert.equal(patientMatchesChannelSource("ch-1", "ab12", "ch-1"), true);
    assert.equal(patientMatchesChannelSource("whatsapp", "ab12", "ch-1"), false);
  });

  it("treats whatsapp/chatbot as generic first-touch sources", () => {
    assert.equal(isGenericPatientSource("whatsapp"), true);
    assert.equal(isGenericPatientSource("chatbot"), true);
    assert.equal(isGenericPatientSource(null), true);
    assert.equal(isGenericPatientSource("ref:ab12"), false);
    assert.equal(isGenericPatientSource("instagram"), false);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGreenApiChatId } from "./green-api.ts";

test("normalizeGreenApiChatId: strips plus and formatting", () => {
  assert.equal(normalizeGreenApiChatId("+7 (700) 123-45-67"), "77001234567@c.us");
  assert.equal(normalizeGreenApiChatId("77001234567"), "77001234567@c.us");
  assert.equal(normalizeGreenApiChatId("77001234567@c.us"), "77001234567@c.us");
});

import { test } from "node:test";
import assert from "node:assert/strict";

// platform-config.defaults transitively imports @workspace/db, which requires
// DATABASE_URL at import time. The tests never touch the database.
process.env["DATABASE_URL"] ??= "postgres://test:test@localhost:5432/test";

// defaults ↔ plan-limits ↔ service form a circular import chain; entering the
// cycle through the service module (as the app does) avoids TDZ errors.
await import("./platform-config.service");

const {
  DEFAULT_CHATBOT_PROMPT_COMPOSER,
  OPUS_META_SECTION_FOLLOWUPS,
  OPUS_META_SECTION_VISIT_CONFIRM,
  mergePlatformSectionsIntoOpusMetaPrompt,
  resolveOpusMetaPrompt,
} = await import("./platform-config.defaults");

const LEGACY_STORED_PROMPT = `Ты составляешь SYSTEM PROMPT для ассистента.

5. ФОРМАТ ОТВЕТОВ (КРИТИЧНО)
Модель отвечает JSON: reply и replyParts.

7. ЗАПРЕЩЕНО
- Выдумывать факты

=== ВХОД ===
Сырые данные клиники.

=== ВЫХОД ===
Верни только готовый system prompt.`;

test("default opus meta prompt contains the platform sections", () => {
  const prompt = DEFAULT_CHATBOT_PROMPT_COMPOSER.opusMetaPrompt;
  assert.ok(prompt.includes("8. ПОВТОРНЫЕ КАСАНИЯ"));
  assert.ok(prompt.includes("11. ПОДТВЕРЖДЕНИЕ ВИЗИТА ЗА ЧАС ДО ПРИЁМА"));
  // Sections must come before the input marker so the prompt stays coherent.
  assert.ok(prompt.indexOf("ПОВТОРНЫЕ КАСАНИЯ") < prompt.indexOf("=== ВХОД ==="));
});

test("legacy stored prompt gets platform sections appended without losing content", () => {
  const resolved = resolveOpusMetaPrompt(LEGACY_STORED_PROMPT);
  assert.ok(resolved.includes("7. ЗАПРЕЩЕНО"));
  assert.ok(resolved.includes("Сырые данные клиники."));
  assert.ok(resolved.includes("8. ПОВТОРНЫЕ КАСАНИЯ"));
  assert.ok(resolved.includes("11. ПОДТВЕРЖДЕНИЕ ВИЗИТА ЗА ЧАС ДО ПРИЁМА"));
  assert.ok(resolved.indexOf("ПОВТОРНЫЕ КАСАНИЯ") < resolved.indexOf("=== ВХОД ==="));
});

test("merge is idempotent — sections are not appended twice", () => {
  const once = mergePlatformSectionsIntoOpusMetaPrompt(LEGACY_STORED_PROMPT);
  const twice = mergePlatformSectionsIntoOpusMetaPrompt(once);
  assert.equal(once, twice);
  assert.equal(twice.split("8. ПОВТОРНЫЕ КАСАНИЯ").length, 2);
});

test("stored prompt missing only the visit-confirmation section gets just that section", () => {
  const stored = `${LEGACY_STORED_PROMPT}\n\n${OPUS_META_SECTION_FOLLOWUPS}`;
  const resolved = mergePlatformSectionsIntoOpusMetaPrompt(stored);
  assert.equal(resolved.split("8. ПОВТОРНЫЕ КАСАНИЯ").length, 2);
  assert.ok(resolved.includes(OPUS_META_SECTION_VISIT_CONFIRM.slice(0, 40)));
});

test("stored prompt without input marker gets sections appended at the end", () => {
  const stored = "Промпт с форматом replyParts, но без маркеров входа.";
  const resolved = mergePlatformSectionsIntoOpusMetaPrompt(stored);
  assert.ok(resolved.startsWith(stored));
  assert.ok(resolved.includes("8. ПОВТОРНЫЕ КАСАНИЯ"));
});

test("invalid stored prompt falls back to the default", () => {
  assert.equal(resolveOpusMetaPrompt(""), DEFAULT_CHATBOT_PROMPT_COMPOSER.opusMetaPrompt);
  assert.equal(
    resolveOpusMetaPrompt("случайный текст без нужных маркеров"),
    DEFAULT_CHATBOT_PROMPT_COMPOSER.opusMetaPrompt,
  );
});

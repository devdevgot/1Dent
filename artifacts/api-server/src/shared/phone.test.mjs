import { strict as assert } from "node:assert";
import { normalizePhoneDigits, phonesMatch } from "./phone.ts";

assert.equal(normalizePhoneDigits("+7 (900) 123-45-67"), "79001234567");
assert.equal(normalizePhoneDigits("79001234567"), "79001234567");
assert.equal(normalizePhoneDigits(""), "");

assert.ok(phonesMatch("79001234567", "+7 (900) 123-45-67"));
assert.ok(phonesMatch("89001234567", "79001234567"));
assert.ok(phonesMatch("8 (900) 123-45-67", "+79001234567"));
assert.ok(phonesMatch("9001234567", "79001234567"));
assert.ok(phonesMatch("9001234567", "+7 900 123 45 67"));

assert.ok(!phonesMatch("79001234567", "79001234568"));
assert.ok(!phonesMatch("1234567", "7654321"));

console.log("phone tests passed");

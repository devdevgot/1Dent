#!/usr/bin/env node
/**
 * Generate VAPID keys for Web Push (optional — server auto-generates if unset).
 * Run: node scripts/generate-vapid-keys.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const webpush = require(path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../artifacts/api-server/node_modules/web-push",
));

const keys = webpush.generateVAPIDKeys();

console.log("Optional — add to Railway api-server env (or skip: keys auto-save on first push):\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("VAPID_SUBJECT=mailto:support@1dent.kz");

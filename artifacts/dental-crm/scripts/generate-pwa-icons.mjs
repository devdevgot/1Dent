/**
 * Regenerate PWA / iOS home-screen icons from public/logo_clean.png.
 *
 * Requires: npm install sharp (one-off or devDependency)
 * Run from artifacts/dental-crm: node scripts/generate-pwa-icons.mjs
 *
 * iOS 26 (Liquid Glass) rules for apple-touch-icon:
 *  - square, fully opaque (RGB — no alpha channel)
 *  - solid brand-blue background to all four edges
 *  - logo scaled to fit inside ~80–82% safe zone — never cropped
 *  - squircle fill is flattened onto the same blue so only the white "1D" shows
 */
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, "../public");
const SRC = path.join(PUBLIC, "logo_clean.png");

/** Sampled from logo_clean squircle fill — matches the brand mark. */
const BRAND_BLUE = { r: 21, g: 123, b: 251 };

async function trimmedLogo() {
  return sharp(SRC).trim({ threshold: 1 }).toBuffer();
}

/**
 * Opaque home-screen icon: white 1D on full-bleed brand blue.
 * Flattening merges the squircle fill with the canvas so iOS sees one layer.
 */
async function makeAppleTouchIcon(size, outPath, safeRatio = 0.82) {
  const trimmed = await trimmedLogo();
  const safe = Math.round(size * safeRatio);
  const logo = await sharp(trimmed)
    .resize(safe, safe, { fit: "inside", background: BRAND_BLUE })
    .flatten({ background: BRAND_BLUE })
    .toBuffer();
  const meta = await sharp(logo).metadata();
  const left = Math.round((size - meta.width) / 2);
  const top = Math.round((size - meta.height) / 2);

  await sharp({
    create: { width: size, height: size, channels: 3, background: BRAND_BLUE },
  })
    .composite([{ input: logo, left, top }])
    .removeAlpha()
    .png()
    .toFile(outPath);

  console.log(`✓ ${path.relative(PUBLIC, outPath)} (${size}×${size})`);
}

/** Standard PWA icon (any) — logo on white canvas for install UI contrast. */
async function makePwaIcon(size, outPath, logoRatio = 0.72) {
  const trimmed = await trimmedLogo();
  const logoSize = Math.round(size * logoRatio);
  const logo = await sharp(trimmed)
    .resize(logoSize, logoSize, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  const pad = Math.round((size - logoSize) / 2);

  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: logo, top: pad, left: pad }])
    .png()
    .toFile(outPath);

  console.log(`✓ ${path.relative(PUBLIC, outPath)}`);
}

/** Maskable icon — full-bleed brand blue, logo within the 80% safe zone. */
async function makeMaskableIcon(size, outPath, safeRatio = 0.8) {
  await makeAppleTouchIcon(size, outPath, safeRatio);
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error("Missing", SRC);
    process.exit(1);
  }

  const pwaDir = path.join(PUBLIC, "icons/pwa");
  const appleDir = path.join(PUBLIC, "icons/apple");
  fs.mkdirSync(pwaDir, { recursive: true });
  fs.mkdirSync(appleDir, { recursive: true });

  console.log("Generating from", SRC);

  for (const size of [152, 167, 180]) {
    await makeAppleTouchIcon(size, path.join(appleDir, `apple-touch-icon-${size}x${size}.png`));
  }
  await makeAppleTouchIcon(180, path.join(PUBLIC, "apple-touch-icon.png"));

  await makePwaIcon(192, path.join(pwaDir, "icon-192.png"));
  await makePwaIcon(512, path.join(pwaDir, "icon-512.png"));
  await makeMaskableIcon(192, path.join(pwaDir, "icon-maskable-192.png"));
  await makeMaskableIcon(512, path.join(pwaDir, "icon-maskable-512.png"));

  await sharp(path.join(pwaDir, "icon-192.png")).toFile(path.join(PUBLIC, "android-chrome-192x192.png"));
  console.log("✓ android-chrome-192x192.png");

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

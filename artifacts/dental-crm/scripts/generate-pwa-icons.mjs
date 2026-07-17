/**
 * Regenerate PWA / iOS home-screen icons from public/logo_clean.png.
 *
 * Requires: npm install sharp (one-off or devDependency)
 * Run from artifacts/dental-crm: node scripts/generate-pwa-icons.mjs
 *
 * iOS 26 (Liquid Glass): ~88% safe zone — room for system glass/refraction.
 * iOS 18 and below: logo fills ~94% of the canvas so the mark reads full-size
 * inside Apple's squircle mask (no "tiny logo in a big icon" look).
 */
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, "../public");
const SRC = path.join(PUBLIC, "logo_clean.png");

/** Apple home-screen — larger mark for pre–iOS 26 squircle display. */
const APPLE_TOUCH_SAFE_RATIO = 0.94;

const BRAND_BLUE = { r: 21, g: 123, b: 251 };

async function trimmedLogo() {
  return sharp(SRC).trim({ threshold: 1 }).toBuffer();
}

/** Crop to the white 1D mark only — ignores blue squircle padding in logo_clean. */
async function whiteMarkBuffer() {
  const trimmed = await trimmedLogo();
  const { data, info } = await sharp(trimmed)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (r > 210 && g > 210 && b > 210) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX <= minX || maxY <= minY) {
    return trimmed;
  }

  const pad = Math.max(2, Math.round(Math.min(width, height) * 0.02));
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const extractWidth = Math.min(width - left, maxX - minX + 1 + pad * 2);
  const extractHeight = Math.min(height - top, maxY - minY + 1 + pad * 2);

  return sharp(trimmed)
    .extract({ left, top, width: extractWidth, height: extractHeight })
    .png()
    .toBuffer();
}

/**
 * Opaque home-screen icon: white 1D on full-bleed brand blue.
 * Uses white-mark crop so pre–iOS 26 icons show a full-size logo, not a tiny mark.
 */
async function makeAppleTouchIcon(size, outPath, safeRatio = APPLE_TOUCH_SAFE_RATIO) {
  const mark = await whiteMarkBuffer();
  const target = Math.round(size * safeRatio);
  const logo = await sharp(mark)
    .resize(target, target, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const meta = await sharp(logo).metadata();
  const left = Math.round((size - (meta.width ?? target)) / 2);
  const top = Math.round((size - (meta.height ?? target)) / 2);

  await sharp({
    create: { width: size, height: size, channels: 3, background: BRAND_BLUE },
  })
    .composite([{ input: logo, left, top }])
    .removeAlpha()
    .png()
    .toFile(outPath);

  console.log(`✓ ${path.relative(PUBLIC, outPath)} (${size}×${size}, mark ${safeRatio * 100}%)`);
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

/** Maskable icon — Android adaptive; keep 80% safe zone per spec. */
async function makeMaskableIcon(size, outPath, safeRatio = 0.8) {
  const mark = await whiteMarkBuffer();
  const target = Math.round(size * safeRatio);
  const logo = await sharp(mark)
    .resize(target, target, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const meta = await sharp(logo).metadata();
  const left = Math.round((size - (meta.width ?? target)) / 2);
  const top = Math.round((size - (meta.height ?? target)) / 2);

  await sharp({
    create: { width: size, height: size, channels: 3, background: BRAND_BLUE },
  })
    .composite([{ input: logo, left, top }])
    .removeAlpha()
    .png()
    .toFile(outPath);

  console.log(`✓ ${path.relative(PUBLIC, outPath)} (maskable ${size}×${size})`);
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
    await makeAppleTouchIcon(size, path.join(appleDir, `apple-touch-icon-${size}x${size}.png`), APPLE_TOUCH_SAFE_RATIO);
  }
  await makeAppleTouchIcon(180, path.join(PUBLIC, "apple-touch-icon.png"), APPLE_TOUCH_SAFE_RATIO);

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

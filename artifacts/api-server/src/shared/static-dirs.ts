import fs from "fs";
import path from "path";
import type { Response } from "express";

const STATIC_ASSET_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".css",
  ".map",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".json",
  ".wasm",
  ".txt",
]);

function distExists(distDir: string): boolean {
  return fs.existsSync(path.join(distDir, "index.html"));
}

/** True for hashed bundles and other files that must never receive SPA index.html fallback. */
export function isStaticAssetPath(urlPath: string): boolean {
  const pathname = urlPath.split("?")[0] ?? urlPath;
  if (pathname.startsWith("/assets/")) return true;
  const ext = path.extname(pathname).toLowerCase();
  return STATIC_ASSET_EXTENSIONS.has(ext);
}

export function setSpaStaticCacheHeaders(res: Response, filePath: string): void {
  if (filePath.endsWith(`${path.sep}index.html`)) {
    res.setHeader("Cache-Control", "no-cache");
    return;
  }
  // Service worker and manifest must revalidate so PWA updates roll out promptly.
  if (filePath.endsWith(`${path.sep}sw.js`)) {
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Service-Worker-Allowed", "/");
    return;
  }
  if (filePath.endsWith(".webmanifest")) {
    res.setHeader("Cache-Control", "public, max-age=3600");
    return;
  }
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
}

/** Resolve SPA dist directory — works in monorepo (artifacts/*) and flat Railway layouts. */
export function resolveSpaDistDir(appName: "tg-admin-app" | "dental-crm"): string {
  const entryDir = typeof __dirname === "string" ? __dirname : process.cwd();
  const candidates = [
    path.resolve(entryDir, "../../..", `artifacts/${appName}/dist/public`),
    path.resolve(entryDir, "../../..", `${appName}/dist/public`),
    path.resolve(process.cwd(), `artifacts/${appName}/dist/public`),
    path.resolve(process.cwd(), `${appName}/dist/public`),
  ];

  for (const dir of candidates) {
    if (distExists(dir)) return dir;
  }

  return candidates[0]!;
}

export function resolveTmaDistDir(): string {
  return resolveSpaDistDir("tg-admin-app");
}

export function resolveCrmDistDir(): string {
  return resolveSpaDistDir("dental-crm");
}

import fs from "fs";
import path from "path";

function distExists(distDir: string): boolean {
  return fs.existsSync(path.join(distDir, "index.html"));
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

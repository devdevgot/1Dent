import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.resolve("artifacts/screenshots");

const emptyMocks = {
  "/api/analytics/owner": {
    success: true,
    data: {
      analytics: {
        revenueThisMonth: 0,
        newPatientsThisMonth: 0,
        completedProceduresThisMonth: 0,
        totalPatients: 0,
        redAlertCount: 0,
        revenueByPaymentMethod: [],
      },
    },
  },
  "/api/analytics/financial-summary": {
    success: true,
    data: { netProfit: 0, totalIncome: 0, totalExpenses: 0 },
  },
  "/api/procedures": { success: true, data: { procedures: [] } },
  "/api/patients": { success: true, data: { patients: [] } },
  "/api/analytics/doctor/kpis": { success: true, data: { kpis: [] } },
  "/api/channels": { success: true, data: { channels: [] } },
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    for (const [pattern, body] of Object.entries(emptyMocks)) {
      if (pathname.startsWith(pattern)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      }
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: {} }),
    });
  });

  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);

  await page.screenshot({ path: path.join(OUT, "dashboard-full.png"), fullPage: true });

  const illustration = page.locator('img[src="/images/revenue-empty-illustration.png"]');
  if (await illustration.count()) {
    await illustration.screenshot({ path: path.join(OUT, "illustration-only.png") });
  }

  const emptyState = page.locator(".dash-card").first();
  if (await emptyState.count()) {
    await emptyState.screenshot({ path: path.join(OUT, "revenue-card.png") });
  }

  const box = await illustration.boundingBox();
  console.log("Illustration bounding box:", box);

  await browser.close();
  console.log("Screenshots saved to", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

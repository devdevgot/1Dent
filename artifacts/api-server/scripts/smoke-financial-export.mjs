/**
 * Smoke test: financial export builders (no DB required).
 * Run: node artifacts/api-server/scripts/smoke-financial-export.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";

process.env.DATABASE_URL ??= "postgresql://smoke:smoke@127.0.0.1:5432/smoke";

const req = createRequire(path.join(process.cwd(), "artifacts/api-server/package.json"));
const { buildFinancialExcel, buildFinancialPdf } = await import(
  "../src/modules/analytics/financial-export.ts"
);

const mock = {
  clinicName: "Smoke Clinic",
  periodLabel: "01.01.2026 — 07.07.2026",
  filters: {},
  procedures: [
    {
      id: "1",
      name: "Чистка",
      price: 15000,
      paymentMethod: "cash",
      status: "completed",
      scheduledAt: new Date(),
      completedAt: new Date(),
      notes: null,
      patientId: "p1",
      doctorId: "d1",
    },
  ],
  expenses: [],
  consumption: [],
  patientMap: new Map([["p1", "Иванов"]]),
  doctorMap: new Map([["d1", "Петров"]]),
  totalRevenue: 15000,
  totalMaterialCost: 0,
  totalOperationalExpenses: 0,
  netProfit: 15000,
  marginPct: 100,
  expensesByCategory: {},
  revenueByDoctor: [{ name: "Петров", count: 1, total: 15000 }],
};

const xlsx = await buildFinancialExcel(mock);
const pdf = await buildFinancialPdf(mock);

if (xlsx.length < 1000) throw new Error(`XLSX too small: ${xlsx.length}`);
if (pdf.length < 1000) throw new Error(`PDF too small: ${pdf.length}`);

console.log(`OK: xlsx=${xlsx.length}B pdf=${pdf.length}B`);

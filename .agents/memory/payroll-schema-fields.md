---
name: Payroll schema field names
description: Correct field names for payrollRecordsTable and clinicExpensesTable in lib/db/src/schema/payroll.ts
---

**payrollRecordsTable** (table: `payroll_records`):
- Period is stored as `periodMonth: integer` + `periodYear: integer` (NOT `periodStart: timestamp`)
- Pay amount is `calculatedAmount: numeric` (NOT `netPay`)
- Approved override: `approvedAmount: numeric | null`
- Status: `pending | approved | paid`

**clinicExpensesTable** (table: `clinic_expenses`):
- Free-text note field is `description: text` (NOT `note`)
- Category is an enum `expense_category` — pass as string and cast `as never` when inserting
- Date field: `expenseDate: timestamp`

**Why:** These were discovered when finances route returned 500 errors due to wrong field references compiling fine in TypeScript (schema inference at runtime vs compile time).

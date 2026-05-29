---
name: API client type exports
description: Which types are and aren't exported from @workspace/api-client-react main index
---

Some schema types (e.g. `DoctorKpi`) exist in `api.schemas.d.ts` but are NOT re-exported from the main package index.

**Why:** The orval codegen only re-exports types used directly by hook/function signatures. Nested types inside response wrappers (e.g. `DoctorKpiListResponseData.kpis: DoctorKpi[]`) are not promoted.

**How to apply:** When you need a type from a hook result, prefer TypeScript inference (`const items = data?.data?.kpis ?? []`) over explicit imports. If you must import the type, import from the deep path: `@workspace/api-client-react/dist/generated/api.schemas`.

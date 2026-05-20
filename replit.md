# Laporan Harian — Sistem Laporan Kerja Harian

Aplikasi web HR untuk membuat, mengirim, dan memonitor laporan harian karyawan dengan dashboard analitik.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/laporan-harian run dev` — run the frontend (port 23822)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind v4 + shadcn/ui + Recharts + Wouter
- API: Express 5 + Pino logging
- DB: PostgreSQL + Drizzle ORM (explicit joins only, no relational API)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/src/generated/api.ts` — generated React Query hooks
- `lib/db/src/schema/` — Drizzle ORM table definitions
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/laporan-harian/src/pages/` — React page components
- `artifacts/laporan-harian/src/contexts/AuthContext.tsx` — auth state
- `artifacts/laporan-harian/src/components/Layout.tsx` — sidebar layout

## Architecture decisions

- Contract-first: OpenAPI spec drives all API types and React Query hooks via Orval codegen
- No Drizzle relational query API (`db.query.*`) — only explicit `db.select().from()` with joins; avoids `normalizeRelation` errors when `relations()` are not defined
- Auth via HTTP-only cookie `session_token`; `getUserFromToken()` in auth.ts shared across all routes
- `inArray()` from drizzle-orm used for filtering by multiple IDs (not raw `ANY()` SQL)
- Frontend routes are protected by `AuthProvider` — unauthenticated users always see login page

## Product

- **Login**: Role-based accounts (karyawan / hr / admin / direktur)
- **Dashboard**: Stats cards + bar chart (department productivity) + pie charts (submit rate, completion rate)
- **Laporan Saya**: Multi-task form with progress slider, copy yesterday's tasks, save draft / submit
- **Monitoring**: Table with date/month/year/department/employee/status filters, submit indicators
- **Detail Laporan**: Full report view with task table, review/revision actions, comment thread
- **Notifikasi**: Notification list with mark-read and link to related report

## Demo Accounts

- Login produksi: gunakan akun yang dibuat di database perusahaan.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Never use `db.query.*` relational syntax — there are no `relations()` in the schema; use explicit joins
- Always use `inArray(column, ids)` for filtering by array of IDs, not raw SQL `ANY()`
- Run `pnpm --filter @workspace/api-spec run codegen` after any OpenAPI spec changes
- Do not run `pnpm dev` at the workspace root

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

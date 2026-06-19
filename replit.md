# JABEEN Investor Portal

The authoritative portal for Jubail Industrial City investors to track industrial project construction and operational milestones across a multi-role workflow.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/jabeen-portal run dev` — run the frontend (port from $PORT env)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string, `SESSION_SECRET` — for JWT signing

## Seed Data

Run once to populate the DB with demo users and sample projects:
```
/home/runner/workspace/node_modules/.pnpm/node_modules/.bin/tsx artifacts/api-server/src/seed.ts
```

Demo accounts:
- `admin@jabeen.sa` / `Admin@2026!` — Administrator
- `pm1@jabeen.sa` / `Manager@2026!` — Project Manager
- `tm1@jabeen.sa` / `TopMgmt@2026!` — Top Management
- `investor1@acmecorp.com` / `Investor@2026!` — Investor (Acme Plastics)
- `investor2@gulfpetro.com` / `Investor@2026!` — Investor (Gulf Petro Refinery)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080, path prefix `/api`)
- DB: PostgreSQL + Drizzle ORM
- Auth: JWT access tokens (localStorage `jabeen_access_token`) + httpOnly refresh cookie (`jabeen_refresh`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Tailwind v4 + shadcn/ui

## Where things live

- `lib/db/src/schema/` — Drizzle schema (source of truth for DB shape)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/src/generated/` — Orval-generated React Query hooks + Zod schemas
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/jabeen-portal/src/` — React frontend
- `artifacts/api-server/src/seed.ts` — Demo seed script

## Architecture decisions

- Contract-first: OpenAPI spec drives both server validation (Zod) and client hooks (Orval codegen)
- JWT dual-token: short-lived access token in localStorage, long-lived refresh token in httpOnly cookie
- RBAC enforced at route middleware level: roles are `administrator`, `top-management`, `project-manager`, `investor`
- All Orval `useQuery` hooks require explicit `queryKey` in options (generated type requires it)
- Google Fonts must be loaded via `<link>` in `index.html`, NOT `@import url()` in CSS (Tailwind v4 inlines first)

## Product

Four roles interact with industrial investor projects in Jubail Industrial City:
- **Investor** — views their own projects, stages, documents, messages
- **Project Manager** — manages assigned projects, submits/approves status updates
- **Top Management** — read access across all projects, sees dashboard KPIs
- **Administrator** — full system access: user management, pipeline templates, audit log, settings

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `pnpm run typecheck` must pass before assuming Vite HMR is fully healthy
- After any lib change, run `pnpm run typecheck:libs` before frontend typecheck
- API refresh flood in logs is from old browser sessions before the use-auth.tsx fix; clears on hard-reload
- `tsx` binary is at `/home/runner/workspace/node_modules/.pnpm/node_modules/.bin/tsx` (not in root `.bin`)
- All Orval query hooks need `queryKey: getFooQueryKey(args)` in their options — TypeScript requires it

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

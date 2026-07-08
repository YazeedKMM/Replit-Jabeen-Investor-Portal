# Redesign Phase D: Structure & Build — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the portal's six primary surfaces fresh on the new identity (auth/login, dashboard, investor pipeline, reports, settings, admin panel), ship the reports backend first, then remove the DGA design system entirely.

**Architecture:** Reports are three new spec-first endpoints (`openapi.yaml` → orval hooks) implemented in `artifacts/api-server` with in-memory aggregation over Drizzle selects (same style as `routes/dashboard.ts`). Pages are rebuilt in place (decision on record: rebuild, not reskin) as Radix + Tailwind compositions consuming ThemeProvider tokens only. Pages outside the six rebuild targets that still import dga-* wrappers get a mechanical component swap, after which the DGA dependency, CSS, and Vite plumbing are deleted.

**Tech Stack:** React 19 + Tailwind 4 + Vite (`artifacts/jabeen-portal`), Express 5 + Drizzle/Postgres (`artifacts/api-server`), OpenAPI 3.1 + orval codegen, wouter routing, i18next (ar/en), recharts via `components/ui/chart.tsx`.

**Spec:** `docs/superpowers/specs/2026-07-05-investor-portal-redesign-design.md` §Phase D
**Identity source of truth:** `DESIGN.md` (repo root) · **RTL registry:** `docs/rtl.md`

---

## Environment prerequisites (read first)

Linux-only pnpm workspace — runs in Docker, never natively on Windows.

- **Run:** `docker compose -f .docker-run/docker-compose.yml up -d` → SPA :5173, API :8080.
- **Fresh DB (required before any test-suite run):** `docker compose -f .docker-run/docker-compose.yml down -v` then `up -d` (reseeds).
- **Bind mounts** (edits go live without image rebuild): `artifacts/api-server/src` (restart app container to apply: `docker compose -f .docker-run/docker-compose.yml restart app`), `artifacts/jabeen-portal/src`, `artifacts/jabeen-portal/index.html`, `lib/api-spec/openapi.yaml`, `lib/api-client-react/src`, `lib/api-zod/src`. **NOT mounted:** `vite.config.ts`, any `package.json`, `pnpm-lock.yaml` — changes to those need `docker compose -f .docker-run/docker-compose.yml build app` + `up -d`.
- **Windows gotcha:** Vite in the container does not see Windows bind-mount file *creation* events — after creating a new file under `src/`, restart the app container. First visit to a new page triggers dep re-optimization + forced reload that can swallow browser interactions; retry once stable.
- **Codegen after editing `openapi.yaml`** (in place, lands on host via mounts):
  ```bash
  docker exec jabeen-run-app-1 bash -lc "cd /app/lib/api-spec && pnpm exec orval --config ./orval.config.ts"
  ```
- **OpenAPI 3.1.0:** never `nullable: true`; use `type: ["string", "null"]`.
- **Typecheck:** `docker exec jabeen-run-app-1 bash -lc "cd /app && pnpm exec tsc --build --force && pnpm --filter @workspace/api-server --filter @workspace/jabeen-portal run typecheck"`. (The workspace-wide `pnpm run typecheck` fails in the unrelated legacy `@workspace/scripts` package — pre-existing on main, flagged for a separate fix, out of Phase D scope.)
- **Test suites** (each needs a freshly seeded DB — they mutate MFA state):
  `node .docker-run/test-suite.mjs` (expect 148/0) · `node .docker-run/test-branding.mjs` (expect 18/18) · `node .docker-run/test-reports.mjs` (created in Task 2).
- **Preview tools:** if you `down -v`, the preview server handle orphans — do `docker compose down`, then `preview_start` with name `app` (see `.claude/launch.json`).
- **Seeded credentials:** admin `admin@jabeen.sa` / `Admin@2026!`, PM `pm1@jabeen.sa` / `Manager@2026!`, TM `tm1@jabeen.sa` / `TopMgmt@2026!`, investor `investor1@acmecorp.com` / `Investor@2026!`. Admin/PM (and possibly TM) need MFA enrollment — copy the `totp`/`loginWithMfaSetup` helpers from `.docker-run/test-branding.mjs`.
- **Orval hooks:** every generated `useQuery` hook requires explicit `queryKey: getXxxQueryKey(...)` in options.
- **Fonts:** already loaded via `<link>` in `index.html` (IBM Plex Sans Arabic, Sora, IBM Plex Mono) — do not add `@import url()` in CSS.

## Shape output — IA decisions (impeccable shape, spec §Phase D Planning)

Register: **product** (app UI; design serves the task). Color strategy: **Restrained** per DESIGN.md — neutral surfaces, brand color deliberate on actions/nav/status. Scene: *an investor and an RCJY officer reviewing licensing stages in a bright Jubail office; daylight, procedural, engineered calm* → light default, designed dark variant (both already exist as token blocks; ThemeProvider owns switching). Anchor references: **Linear** (quiet app chrome, density), **Stripe Dashboard** (data clarity, restrained charts), **Notion settings** (calm forms).

The six surfaces map to files as follows:

| # | Surface | Files (replaced in place) | Route(s) | Roles |
|---|---|---|---|---|
| 1 | Auth/login | `pages/auth/login.tsx`, `pages/auth/mfa-verify.tsx` (embedded step), `pages/auth/mfa-setup.tsx` | `/login`, `/mfa/setup` | public |
| 2 | Dashboard | `pages/dashboard/dashboard.tsx` | `/dashboard` | PM, TM, admin |
| 3 | Investor pipeline | `pages/investor/my-projects.tsx` | `/my-projects` | investor |
| 4 | Reports | `pages/reports/reports.tsx` (NEW) | `/reports` (NEW) | PM, TM, admin |
| 5 | Settings | `pages/settings/settings.tsx` | `/settings` | admin |
| 6 | Admin panel | `pages/admin/users.tsx`, `cities.tsx`, `categories.tsx`, `templates.tsx`, `template-builder.tsx` | `/users`, `/cities`, `/categories`, `/templates`, `/templates/:id` | per existing router |

Decisions locked during shape:

- **"Investor pipeline" = the investor's home** (`/my-projects` rebuilt as a stage-journey view). The manager-side pipeline analytics live in Reports (counts by stage, conversion funnel). No new manager board page — spec forbids new product features beyond reports.
- **Stage data for investors:** investors cannot read `/templates` (privileged-only), but `GET /projects/{id}` returns `pipeline` (full `Template` with `stages[]`) and `currentStage` (`StageSummary` with `orderIndex`/`category`/`progressBaseline`). The journey rail renders from `project.pipeline.stages`. The list endpoint (`ProjectListItem`) carries only `currentStage` + `pipelineName`.
- **Stage count is data-driven.** The spec says "six lifecycle stages" but the seeded RCJY Standard Pipeline has **seven** (Agreement Signed → Land Allocation → Design & Approvals → Foundation & Structure → MEP & Fit-Out → Testing & Commissioning → Operational). Never hardcode a stage count; render whatever the template defines.
- **Reports finalized** (from the spec's candidates): (1) project distribution by stage/city/category, (2) pipeline stage conversion funnel per template, (3) monthly activity time series (projects created, updates submitted, updates approved). Role-gated exactly like `GET /dashboard` (`PRIVILEGED_ROLES`, investor → 403).
- **`pages/admin/branding.tsx` is NOT rebuilt** — it was built new in Phase B on the new token system and imports no dga-* wrapper. Same for `pages/not-found.tsx` unless it imports dga-* (it doesn't).
- **Out-of-scope pages that still import dga-*** (project-workspace + its 5 tabs, profile, audit-log) get a **mechanical de-DGA swap** (Task 11), not a fresh rebuild — required so the teardown gate ("no page imports dga-*") can pass while preserving functionality.

## Craft standards digest (binding for every page task)

Each page implementer works from this digest plus `DESIGN.md` + `docs/rtl.md`. Non-negotiable:

1. **Tokens only.** Colors exclusively via Tailwind token utilities (`bg-primary`, `text-muted-foreground`, `border-border`, `ring-ring`, `bg-surface`…) or `var(--…)`. Zero literal colors (`#hex`, `rgb()`, `hsl()`, `oklch()`) in page files. Charts use `var(--chart-1)`…`var(--chart-5)` (mapped: 1=primary, 2=secondary, 3=accent, 4=success, 5=warning). Sidebar consumes the same tokens as everything else — no bespoke sub-palette.
2. **Success/warning are tinted fills** with the mode's body-text color over them (light: `ink`; dark: `bg`) — never solid fills with a paired foreground. `primary`/`secondary`/`accent` have real `-foreground` tokens.
3. **Logical CSS only:** `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`/`text-end`. Any physical property must be justified and registered in `docs/rtl.md`'s intentional table. Directional glyphs (arrows, chevrons, back) get `.rtl-flip`; status/object icons, logos, numerals never flip. If adopting a previously-unused shadcn component (`breadcrumb`, `pagination`, `dropdown-menu`…), add `.rtl-flip` (or `rtl:rotate-180`) to its directional glyphs per `docs/rtl.md`'s cleanup-candidates note.
4. **Typography:** headings `text-2xl`+ carry `font-display` (Sora leads, Arabic falls through to Plex). Body/UI = default sans (IBM Plex Sans Arabic). IDs, agreement/plot numbers, reference codes = `font-mono` wrapped `dir="ltr"` when embedded in RTL text. Never negative tracking on Arabic script.
5. **Product register rules:** fixed rem scale; skeletons (not spinners) for loading; empty states that teach; every interactive control has default/hover/focus-visible/active/disabled/loading states; motion 150–250 ms conveying state only; no orchestrated page-load choreography; modals only where the existing UX already uses them or inline genuinely fails.
6. **Absolute bans:** side-stripe borders (>1px colored inline-start/end accents), gradient text, glassmorphism, the hero-metric template (big number + tiny label + gradient accent grid), identical icon+heading+text card grids, uppercase tracked eyebrows over every section, decorative numbered section markers, text overflow at any breakpoint.
7. **Functionality preservation:** before writing, read the old page fully and inventory every capability (queries, mutations, dialogs, filters, exports, toasts, role-conditional UI). The rebuilt page must cover 100% of that inventory — this is what the spec reviewer checks. Auth flows (MFA setup/verify/recovery, token handling), role-based routing, and audit behavior must be untouched.
8. **i18n:** reuse existing keys (namespaces: `common`, `nav`, `status`, `roles`, `dashboard`, `investor`, `projects`, `admin`, `settings`, `auth`, `validation`…). Every NEW key goes to **both** `src/i18n/locales/ar.json` and `en.json` in the same change. No hardcoded user-facing strings.
9. **Component vocabulary:** use the existing `components/ui/*` set (button, card, table, dialog, field/form, input, select, badge, skeleton, tabs, chart…). Same button/form vocabulary on every screen. Don't introduce new UI libraries.

## Per-page gate check (run after EVERY page task, all four gates before the next page)

With `<files>` = the page files touched by the task:

```bash
# Gate 1 — themed via tokens only (also: no dga imports left in rebuilt files)
grep -nE '#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(|oklch\(' <files>        # expect: no matches
grep -n 'components/ui/dga-' <files>                                # expect: no matches
# Gate 2 — logical properties only (matches docs/rtl.md sweep)
grep -nE '[[:space:]"'"'"'](ml|mr|pl|pr)-[0-9]|left-[0-9]|right-[0-9]|text-left|text-right' <files>
# expect: no matches, or every hit added to docs/rtl.md's intentional table with a reason
# Gate 3 — DESIGN.md type scale: every display-size heading carries font-display
grep -nE 'text-(2xl|3xl|4xl)' <files>                               # every hit must include font-display
```

**Gate 4 — RTL + LTR render check in the running preview** (preview_* tools):
1. Ensure server: `preview_start` name `app`; restart app container first if the task created new files.
2. LTR: `preview_eval` → `localStorage.setItem('i18nextLng','en'); location.reload()`, then `preview_snapshot` + `preview_screenshot`; `preview_console_logs` level `error` must be clean.
3. RTL: same with `'ar'` — verify layout mirrors, directional icons flip, numerals/IDs stay LTR, `preview_screenshot`.
4. For gated pages, log in first (demo credentials above; MFA codes via the totp helper pattern if a fresh DB — or reuse a still-valid admin JWT in `localStorage.jabeen_access_token`).

**Always after gates:** i18n parity check —
```bash
docker exec jabeen-run-app-1 node -e "const a=require('/app/artifacts/jabeen-portal/src/i18n/locales/ar.json'),e=require('/app/artifacts/jabeen-portal/src/i18n/locales/en.json');const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'?f(v,p+k+'.'):p+k);const A=new Set(f(a)),E=new Set(f(e));console.log('ar-only:',[...A].filter(x=>!E.has(x)));console.log('en-only:',[...E].filter(x=>!A.has(x)))"
```
Expect two empty arrays. Then typecheck (command in prerequisites), then commit.

## File structure

| File | Action | Responsibility |
|---|---|---|
| `PRODUCT.md` (repo root) | Create | impeccable init: register + strategy (Task 1) |
| `lib/api-spec/openapi.yaml` | Modify | reports tag, 3 paths, 3 schemas (Task 2) |
| `lib/api-client-react/src/generated/*`, `lib/api-zod/src/generated/*` | Regenerated | orval output (Task 2) |
| `.docker-run/test-reports.mjs` | Create | reports integration tests (Task 2, TDD) |
| `artifacts/api-server/src/routes/reports.ts` | Create | 3 report endpoints (Task 3) |
| `artifacts/api-server/src/routes/index.ts` | Modify | mount reports router (Task 3) |
| `artifacts/jabeen-portal/src/pages/auth/{login,mfa-verify,mfa-setup}.tsx` | Rewrite | Task 4 |
| `artifacts/jabeen-portal/src/pages/dashboard/dashboard.tsx` | Rewrite | Task 5 |
| `artifacts/jabeen-portal/src/pages/investor/my-projects.tsx` | Rewrite | Task 6 |
| `artifacts/jabeen-portal/src/pages/reports/reports.tsx` | Create | Task 7 |
| `artifacts/jabeen-portal/src/app-router.tsx` | Modify | `/reports` route (Task 7) |
| `artifacts/jabeen-portal/src/components/layout/sidebar-nav.tsx` | Modify | Reports nav item (Task 7); later de-DGA visual pass only if needed (it has no dga imports) |
| `artifacts/jabeen-portal/src/i18n/locales/{ar,en}.json` | Modify | `reports.*` + `nav.reports` + per-page additions (Tasks 4–10) |
| `artifacts/jabeen-portal/src/pages/settings/settings.tsx` | Rewrite | Task 8 |
| `artifacts/jabeen-portal/src/pages/admin/{users,cities,categories}.tsx` | Rewrite | Task 9 |
| `artifacts/jabeen-portal/src/pages/admin/{templates,template-builder}.tsx` | Rewrite | Task 10 |
| `artifacts/jabeen-portal/src/pages/projects/project-workspace.tsx` + `tabs/*.tsx` (5), `pages/profile/profile.tsx`, `pages/audit/audit-log.tsx` | Modify | de-DGA swap (Task 11) |
| `artifacts/jabeen-portal/src/components/ui/dga-*.tsx` (6), `src/styles/jabeen-dga-brand.css`, `src/lib/dga-layer-guard.ts` | Delete | Task 12 |
| `artifacts/jabeen-portal/src/main.tsx`, `src/index.css`, `vite.config.ts`, `artifacts/jabeen-portal/package.json`, `pnpm-lock.yaml` | Modify | Task 12 teardown |
| `docs/rtl.md` | Modify | any new intentional-physical entries + icon inventory updates (Tasks 4–11) |

---

### Task 1: impeccable init — PRODUCT.md

The codebase crawl is done (this plan is its output). Register: **product** (app/dashboard — the spec names it). Live-mode config is deliberately skipped: browser verification in this repo uses the preview_* tools, and the spec's init scope is "(PRODUCT.md, app/dashboard register)".

**Files:**
- Create: `PRODUCT.md`

- [ ] **Step 1: Write `PRODUCT.md`** with exactly this content:

```markdown
# Product

## Register

product

## Users

Four roles inside one white-label deployment, all task-driven and bilingual (Arabic RTL is a
first-class equal of English LTR):

- **Investor** — an industrial investor (factory owner, plant operator) tracking their own
  projects through the licensing/construction lifecycle. Checks in periodically, often in
  Arabic, wants "where does my project stand and what happens next" in one glance.
- **Project Manager (RCJY officer)** — the day-to-day power user: reviews status updates,
  manages projects, templates, and branding. City-scoped. Lives in tables and review queues.
- **Top Management** — strictly read-only oversight of the whole portfolio; consumes the
  dashboard and reports.
- **Administrator** — full control: users, pipeline templates, cities, categories, settings,
  audit log, branding.

## Product Purpose

The authoritative portal for Royal Commission industrial-city investors (Jubail, Yanbu,
Ras Al-Khair, Jazan) to track construction and operational milestones of their industrial
projects through a staged lifecycle pipeline — and for RCJY staff to manage that portfolio.
Success: an investor knows exactly where each project stands without calling anyone; staff
review updates promptly; management reads portfolio health at a glance.

## Brand Personality

Engineered calm — "industrial oasis" (see DESIGN.md). Three words: **precise, grounded,
unhurried**. Quiet government-grade infrastructure, procedural and trustworthy; never a
consumer fintech app.

## Anti-references

- The retired DGA gold-on-charcoal identity (no gold brand color, no warm-charcoal surfaces).
- Generic SaaS/fintech: navy-and-gold, purple gradients, glassmorphism, hero-metric dashboards.
- Consumer trading/crypto apps: dense tickers, dopamine red/green, decorative motion.

## Design Principles

1. **The pipeline is the product.** Lifecycle stages are the core mental model; every surface
   orients around "which stage, what's next".
2. **Two scripts, one design.** Every layout must be as good in Arabic/RTL as in English/LTR:
   logical properties only, mirrored directional iconography, LTR-pinned numerals and IDs.
3. **White-label by token.** Pages consume ThemeProvider tokens only; the brand is data, not
   code.
4. **Earned familiarity.** Standard affordances (tables, dialogs, forms) executed exceptionally;
   no invented controls.
5. **Status is vocabulary, not decoration.** Semantic colors appear only as status; identity
   colors carry navigation and action.

## Accessibility & Inclusion

WCAG 2.1 AA (contrast ratios measured in DESIGN.md). Full keyboard paths; visible focus via the
ring token. `prefers-reduced-motion` respected on all animation. Bilingual ar/en with `dir`
switching on `<html>`; numerals and Latin ID strings stay LTR inside RTL text.
```

- [ ] **Step 2: Commit**

```bash
git add PRODUCT.md
git commit -m "docs: add PRODUCT.md (impeccable init, product register)"
```

---

### Task 2: Reports API contract + failing integration tests (TDD red)

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Regenerate: `lib/api-client-react/src/generated/*`, `lib/api-zod/src/generated/*`
- Create: `.docker-run/test-reports.mjs`

- [ ] **Step 1: Add the `reports` tag** to the `tags:` list in `openapi.yaml` (after `branding`):

```yaml
  - name: reports
    description: Portfolio reports and analytics
```

- [ ] **Step 2: Add three paths** after the `/dashboard` + `/projects/export` block (keep the `# --- REPORTS ---` comment):

```yaml
  # --- REPORTS ---
  /reports/distribution:
    get:
      operationId: getReportsDistribution
      tags: [reports]
      summary: Project counts by stage, city, and category (managers only)
      responses:
        "200":
          description: Distribution report
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ReportDistribution"

  /reports/stage-conversion:
    get:
      operationId: getReportsStageConversion
      tags: [reports]
      summary: Pipeline stage conversion funnel (managers only)
      parameters:
        - name: templateId
          in: query
          required: false
          description: Stage template to report on; defaults to the default template
          schema:
            type: integer
      responses:
        "200":
          description: Stage conversion report
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ReportStageConversion"

  /reports/activity:
    get:
      operationId: getReportsActivity
      tags: [reports]
      summary: Monthly activity time series (managers only)
      parameters:
        - name: months
          in: query
          required: false
          description: How many trailing months to include (1-24, default 6)
          schema:
            type: integer
            minimum: 1
            maximum: 24
            default: 6
      responses:
        "200":
          description: Activity report
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ReportActivity"
```

- [ ] **Step 3: Add three schemas** in `components.schemas` (near `DashboardStats`, matching the expanded property style used throughout):

```yaml
    ReportDistribution:
      type: object
      required: [total, unstaged, byStage, byCity, byCategory]
      properties:
        total:
          type: integer
        unstaged:
          type: integer
          description: Projects with no current stage
        byStage:
          type: array
          items:
            type: object
            required: [stageId, stageName, orderIndex, count]
            properties:
              stageId:
                type: integer
              stageName:
                type: string
              orderIndex:
                type: integer
              count:
                type: integer
        byCity:
          type: array
          items:
            type: object
            required: [cityId, city, count]
            properties:
              cityId:
                type: integer
              city:
                type: string
              count:
                type: integer
        byCategory:
          type: array
          items:
            type: object
            required: [categoryId, category, count]
            properties:
              categoryId:
                type: integer
              category:
                type: string
              count:
                type: integer

    ReportStageConversion:
      type: object
      required: [templateId, templateName, totalProjects, stages]
      properties:
        templateId:
          type: integer
        templateName:
          type: string
        totalProjects:
          type: integer
          description: Projects assigned to this template
        stages:
          type: array
          items:
            type: object
            required: [stageId, name, orderIndex, atStage, reached, reachedPct]
            properties:
              stageId:
                type: integer
              name:
                type: string
              orderIndex:
                type: integer
              atStage:
                type: integer
                description: Projects currently at this stage
              reached:
                type: integer
                description: Projects at or past this stage
              reachedPct:
                type: integer

    ReportActivity:
      type: object
      required: [months]
      properties:
        months:
          type: array
          items:
            type: object
            required: [month, projectsCreated, updatesSubmitted, updatesApproved]
            properties:
              month:
                type: string
                description: Calendar month as YYYY-MM (UTC)
              projectsCreated:
                type: integer
              updatesSubmitted:
                type: integer
              updatesApproved:
                type: integer
```

- [ ] **Step 4: Run codegen** (container must be up):

```bash
docker exec jabeen-run-app-1 bash -lc "cd /app/lib/api-spec && pnpm exec orval --config ./orval.config.ts"
```

Verify: `grep -rn "useGetReportsDistribution\|getGetReportsActivityQueryKey" lib/api-client-react/src/generated | head` shows generated hooks.

- [ ] **Step 5: Write `.docker-run/test-reports.mjs`.** Copy the file header, `check`/`api`/`totp`/`loginDirect`/`loginWithMfaSetup` helpers **verbatim from `.docker-run/test-branding.mjs`** (lines 1–69), then this `main`:

```js
async function main() {
  console.log("=== REPORTS ===");

  // Unauthenticated
  let r = await api("GET", "/reports/distribution");
  check("reports: distribution unauthenticated 401", r.status === 401, `got ${r.status}`);

  // Logins
  const admin = await loginWithMfaSetup("admin@jabeen.sa", "Admin@2026!");
  const pm = await loginWithMfaSetup("pm1@jabeen.sa", "Manager@2026!");
  const tm = await loginWithMfaSetup("tm1@jabeen.sa", "TopMgmt@2026!");
  const inv = await loginDirect("investor1@acmecorp.com", "Investor@2026!");
  const invToken = inv.data?.accessToken;
  check("reports: test logins ok", !!admin.token && !!pm.token && !!tm.token && !!invToken,
    "login failure — reseed DB (down -v) and retry");

  // Investor 403 on all three
  for (const p of ["/reports/distribution", "/reports/stage-conversion", "/reports/activity"]) {
    r = await api("GET", p, { token: invToken });
    check(`reports: ${p} investor 403`, r.status === 403, `got ${r.status}`);
  }

  // Distribution — admin
  r = await api("GET", "/reports/distribution", { token: admin.token });
  check("reports: distribution admin 200", r.status === 200, `got ${r.status}`);
  const d = r.data ?? {};
  check("reports: distribution shape", Number.isInteger(d.total) && Number.isInteger(d.unstaged)
    && Array.isArray(d.byStage) && Array.isArray(d.byCity) && Array.isArray(d.byCategory),
    JSON.stringify(d).slice(0, 200));
  const stageSum = (d.byStage ?? []).reduce((s, x) => s + x.count, 0);
  check("reports: byStage + unstaged === total", stageSum + d.unstaged === d.total,
    `${stageSum} + ${d.unstaged} != ${d.total}`);
  const citySum = (d.byCity ?? []).reduce((s, x) => s + x.count, 0);
  check("reports: byCity sums to total", citySum === d.total, `${citySum} != ${d.total}`);
  const dash = await api("GET", "/dashboard", { token: admin.token });
  check("reports: total matches dashboard total", d.total === dash.data?.total,
    `${d.total} != ${dash.data?.total}`);

  // Distribution — PM and TM allowed
  r = await api("GET", "/reports/distribution", { token: pm.token });
  check("reports: distribution PM 200", r.status === 200, `got ${r.status}`);
  r = await api("GET", "/reports/distribution", { token: tm.token });
  check("reports: distribution TM 200", r.status === 200, `got ${r.status}`);

  // Stage conversion — default template
  r = await api("GET", "/reports/stage-conversion", { token: admin.token });
  check("reports: conversion 200", r.status === 200, `got ${r.status}`);
  const c = r.data ?? {};
  check("reports: conversion default template", c.templateName === "RCJY Standard Pipeline",
    c.templateName);
  check("reports: conversion has ordered stages", Array.isArray(c.stages) && c.stages.length >= 2
    && c.stages.every((s, i, a) => i === 0 || a[i - 1].orderIndex < s.orderIndex),
    JSON.stringify(c.stages)?.slice(0, 200));
  check("reports: conversion reached monotonic non-increasing",
    (c.stages ?? []).every((s, i, a) => i === 0 || a[i - 1].reached >= s.reached),
    JSON.stringify((c.stages ?? []).map((s) => s.reached)));
  const atSum = (c.stages ?? []).reduce((s, x) => s + x.atStage, 0);
  check("reports: conversion atStage sums <= totalProjects", atSum <= c.totalProjects,
    `${atSum} > ${c.totalProjects}`);

  // Stage conversion — param validation
  r = await api("GET", "/reports/stage-conversion?templateId=999999", { token: admin.token });
  check("reports: conversion unknown template 404", r.status === 404, `got ${r.status}`);
  r = await api("GET", "/reports/stage-conversion?templateId=abc", { token: admin.token });
  check("reports: conversion bad templateId 400", r.status === 400, `got ${r.status}`);

  // Activity — default 6 months
  r = await api("GET", "/reports/activity", { token: admin.token });
  check("reports: activity 200", r.status === 200, `got ${r.status}`);
  const months = r.data?.months ?? [];
  check("reports: activity 6 buckets", months.length === 6, `got ${months.length}`);
  check("reports: activity month format", months.every((m) => /^\d{4}-\d{2}$/.test(m.month)),
    JSON.stringify(months.map((m) => m.month)));
  const nowKey = new Date().toISOString().slice(0, 7);
  check("reports: activity last bucket is current month", months.at(-1)?.month === nowKey,
    `${months.at(-1)?.month} != ${nowKey}`);
  check("reports: activity counts are non-negative ints", months.every((m) =>
    Number.isInteger(m.projectsCreated) && m.projectsCreated >= 0 &&
    Number.isInteger(m.updatesSubmitted) && m.updatesSubmitted >= 0 &&
    Number.isInteger(m.updatesApproved) && m.updatesApproved >= 0), JSON.stringify(months).slice(0, 200));
  check("reports: activity counts seeded projects", months.reduce((s, m) => s + m.projectsCreated, 0) >= 1,
    "expected at least one seeded project in the window");

  // Activity — param validation and range
  r = await api("GET", "/reports/activity?months=0", { token: admin.token });
  check("reports: activity months=0 400", r.status === 400, `got ${r.status}`);
  r = await api("GET", "/reports/activity?months=25", { token: admin.token });
  check("reports: activity months=25 400", r.status === 400, `got ${r.status}`);
  r = await api("GET", "/reports/activity?months=24", { token: admin.token });
  check("reports: activity months=24 has 24 buckets", r.status === 200 && r.data?.months?.length === 24,
    `status ${r.status}, len ${r.data?.months?.length}`);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Run to verify it fails for the right reason** (fresh DB first — `down -v && up -d`, wait for seed):

```bash
node .docker-run/test-reports.mjs
```

Expected: the three-endpoint checks fail with **404** (routes not implemented); login checks pass. If logins fail, the DB isn't freshly seeded.

- [ ] **Step 7: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-client-react/src/generated lib/api-zod/src/generated .docker-run/test-reports.mjs
git commit -m "feat(api): reports spec (distribution, stage-conversion, activity) + failing integration tests"
```

---

### Task 3: Reports server routes (TDD green)

**Files:**
- Create: `artifacts/api-server/src/routes/reports.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

- [ ] **Step 1: Write `artifacts/api-server/src/routes/reports.ts`:**

```ts
import { Router, type IRouter } from "express";
import type { Response } from "express";
import { asc, eq, gte } from "drizzle-orm";
import {
  db,
  projectsTable,
  citiesTable,
  projectCategoriesTable,
  stagesTable,
  stageTemplatesTable,
  statusUpdatesTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, PRIVILEGED_ROLES } from "../middlewares/requireAuth";

const router: IRouter = Router();

function forbidNonPrivileged(req: AuthenticatedRequest, res: Response): boolean {
  if (!(PRIVILEGED_ROLES as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" });
    return true;
  }
  return false;
}

router.get("/reports/distribution", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (forbidNonPrivileged(req, res)) return;

  const [projects, cities, categories, stages, templates] = await Promise.all([
    db.select().from(projectsTable),
    db.select().from(citiesTable),
    db.select().from(projectCategoriesTable),
    db.select().from(stagesTable),
    db.select().from(stageTemplatesTable),
  ]);
  const cityById = new Map(cities.map((c) => [c.id, c]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const templateNameById = new Map(templates.map((t) => [t.id, t.name]));

  let unstaged = 0;
  const stageCounts = new Map<number, number>();
  const cityCounts = new Map<number, number>();
  const categoryCounts = new Map<number, number>();
  for (const p of projects) {
    if (p.currentStageId == null || !stageById.has(p.currentStageId)) unstaged++;
    else stageCounts.set(p.currentStageId, (stageCounts.get(p.currentStageId) ?? 0) + 1);
    cityCounts.set(p.cityId, (cityCounts.get(p.cityId) ?? 0) + 1);
    categoryCounts.set(p.categoryId, (categoryCounts.get(p.categoryId) ?? 0) + 1);
  }

  const byStage = [...stageCounts.entries()]
    .map(([stageId, count]) => {
      const s = stageById.get(stageId)!;
      return {
        stageId,
        stageName: s.name,
        templateId: s.templateId,
        templateName: templateNameById.get(s.templateId) ?? "Unknown",
        orderIndex: s.orderIndex,
        count,
      };
    })
    .sort((a, b) => a.templateId - b.templateId || a.orderIndex - b.orderIndex || a.stageId - b.stageId);
  const byCity = [...cityCounts.entries()].map(([cityId, count]) => ({
    cityId,
    city: cityById.get(cityId)?.shortName ?? "Unknown",
    count,
  }));
  const byCategory = [...categoryCounts.entries()].map(([categoryId, count]) => ({
    categoryId,
    category: categoryById.get(categoryId)?.name ?? "Unknown",
    count,
  }));

  res.json({ total: projects.length, unstaged, byStage, byCity, byCategory });
});

router.get("/reports/stage-conversion", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (forbidNonPrivileged(req, res)) return;

  let template;
  const raw = req.query.templateId;
  if (raw !== undefined) {
    const templateId = Number(raw);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      res.status(400).json({ error: "templateId must be a positive integer" });
      return;
    }
    [template] = await db.select().from(stageTemplatesTable).where(eq(stageTemplatesTable.id, templateId));
  } else {
    [template] = await db.select().from(stageTemplatesTable).where(eq(stageTemplatesTable.isDefault, true));
  }
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const [stages, projects] = await Promise.all([
    db.select().from(stagesTable).where(eq(stagesTable.templateId, template.id)).orderBy(asc(stagesTable.orderIndex)),
    db.select().from(projectsTable).where(eq(projectsTable.pipelineId, template.id)),
  ]);

  const orderIndexByStageId = new Map(stages.map((s) => [s.id, s.orderIndex]));
  const projectOrderIndexes = projects
    .map((p) => (p.currentStageId != null ? orderIndexByStageId.get(p.currentStageId) : undefined))
    .filter((o): o is number => o !== undefined);

  const totalProjects = projects.length;
  const stageRows = stages.map((s) => {
    const atStage = projects.filter((p) => p.currentStageId === s.id).length;
    const reached = projectOrderIndexes.filter((o) => o >= s.orderIndex).length;
    return {
      stageId: s.id,
      name: s.name,
      orderIndex: s.orderIndex,
      atStage,
      reached,
      reachedPct: totalProjects === 0 ? 0 : Math.round((reached / totalProjects) * 100),
    };
  });

  res.json({ templateId: template.id, templateName: template.name, totalProjects, stages: stageRows });
});

router.get("/reports/activity", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (forbidNonPrivileged(req, res)) return;

  let months = 6;
  const raw = req.query.months;
  if (raw !== undefined) {
    months = Number(raw);
    if (!Number.isInteger(months) || months < 1 || months > 24) {
      res.status(400).json({ error: "months must be an integer between 1 and 24" });
      return;
    }
  }

  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const keyOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  const [projects, updates] = await Promise.all([
    db.select({ createdAt: projectsTable.createdAt }).from(projectsTable).where(gte(projectsTable.createdAt, since)),
    db
      .select({
        createdAt: statusUpdatesTable.createdAt,
        reviewStatus: statusUpdatesTable.reviewStatus,
        reviewedAt: statusUpdatesTable.reviewedAt,
      })
      .from(statusUpdatesTable),
  ]);

  const buckets = new Map<string, { projectsCreated: number; updatesSubmitted: number; updatesApproved: number }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + i, 1));
    buckets.set(keyOf(d), { projectsCreated: 0, updatesSubmitted: 0, updatesApproved: 0 });
  }
  for (const p of projects) {
    const b = buckets.get(keyOf(new Date(p.createdAt)));
    if (b) b.projectsCreated++;
  }
  for (const u of updates) {
    const submitted = buckets.get(keyOf(new Date(u.createdAt)));
    if (submitted) submitted.updatesSubmitted++;
    if (u.reviewStatus === "approved" && u.reviewedAt) {
      const approved = buckets.get(keyOf(new Date(u.reviewedAt)));
      if (approved) approved.updatesApproved++;
    }
  }

  res.json({ months: [...buckets.entries()].map(([month, v]) => ({ month, ...v })) });
});

export default router;
```

Note: if `@workspace/db` does not re-export one of these tables at the top level, check `lib/db/src/index.ts` / `lib/db/src/schema/index.ts` and import from the same path `routes/dashboard.ts` and `routes/updates.ts` use.

- [ ] **Step 2: Mount in `artifacts/api-server/src/routes/index.ts`** — add the import and register inside the protected router, next to `dashboardRouter`:

```ts
import reportsRouter from "./reports";
// …
protectedRouter.use(dashboardRouter);
protectedRouter.use(reportsRouter);
```

- [ ] **Step 3: Restart the API and run the tests to green:**

```bash
docker compose -f .docker-run/docker-compose.yml restart app
node .docker-run/test-reports.mjs
```

Expected: **all checks pass, exit 0**. (No reseed needed if Task 2's run only enrolled MFA — the helpers tolerate already-enrolled accounts only if the same process knows the secret, so if logins fail: `down -v && up -d` and rerun.)

- [ ] **Step 4: Typecheck** (command in prerequisites). Expected: clean.

- [ ] **Step 5: Regression check — the other suites still pass on a fresh DB:**

```bash
docker compose -f .docker-run/docker-compose.yml down -v
docker compose -f .docker-run/docker-compose.yml up -d
# wait for seed to finish (docker compose logs -f app until "seed complete" / API listening)
node .docker-run/test-suite.mjs     # expect 148/0
docker compose -f .docker-run/docker-compose.yml down -v && docker compose -f .docker-run/docker-compose.yml up -d
node .docker-run/test-branding.mjs  # expect 18/18
docker compose -f .docker-run/docker-compose.yml down -v && docker compose -f .docker-run/docker-compose.yml up -d
node .docker-run/test-reports.mjs   # expect all pass
```

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/reports.ts artifacts/api-server/src/routes/index.ts
git commit -m "feat(api): implement reports endpoints (distribution, stage-conversion, activity)"
```

---

### Task 4: Page 1 — Auth/login (rebuild)

**Files:**
- Rewrite: `artifacts/jabeen-portal/src/pages/auth/login.tsx`, `pages/auth/mfa-verify.tsx`, `pages/auth/mfa-setup.tsx`
- Modify (if new keys): `src/i18n/locales/{ar,en}.json`
- Modify (if intentional physical CSS or new mirrored icons): `docs/rtl.md`

**Functionality inventory to preserve (read the old files first — this list is the contract):** email+password login via generated auth hooks; the three login outcomes (`accessToken` → role redirect, `mfaRequired` → embedded `MfaVerifyStep` with TOTP + recovery-code path + back-to-login, `mfaSetupRequired` → navigate `/mfa/setup` carrying `mfaToken`); MFA setup page (QR/secret display, verify-setup code entry, recovery codes display + acknowledge); error states for bad credentials / bad code; loading states; language toggle availability pre-auth; ThemeProvider logo + brand name on the card (logo load failure falls back to brand-name text).

**Design brief:** the portal's only pre-auth surface. One centered composition on `bg`: brand logo (from ThemeProvider, never `.rtl-flip`), `text-4xl font-display` heading, a single quiet `surface` card holding the form (Input + Label + Button vocabulary), `input-otp` for MFA codes. The old DGA gradient side-panel is retired; if any directional hero/panel treatment returns, it must be dir-aware and registered in `docs/rtl.md`. Back arrows get `.rtl-flip` (registry already lists `mfa-verify.tsx` `ArrowLeft`). States: idle, submitting (button loading state), invalid credentials, MFA verify (with recovery toggle), MFA setup, expired mfaToken.

- [ ] **Step 1:** Read the three old files end-to-end; write the capability inventory into the task notes.
- [ ] **Step 2:** Rebuild the three files per the brief and the Craft standards digest. No dga-* imports remain.
- [ ] **Step 3:** Restart app container (new-file/HMR gotcha), then run the **Per-page gate check** on the three files — all four gates + i18n parity + typecheck. Exercise in preview: login as investor (no MFA) end-to-end; trigger the MFA path with admin (fresh DB) far enough to see the verify step render in both dirs.
- [ ] **Step 4: Commit** — `git commit -m "feat(ui): rebuild auth surface (login, MFA verify, MFA setup) on the new identity"`

---

### Task 5: Page 2 — Dashboard (rebuild)

**Files:**
- Rewrite: `artifacts/jabeen-portal/src/pages/dashboard/dashboard.tsx`
- Modify (if new keys): `src/i18n/locales/{ar,en}.json`; (if needed) `docs/rtl.md`

**Functionality inventory to preserve (read the old file first):** `useGetDashboard` KPIs (total / inProgress / complete / needsAttention); byStatus / byCity / byCategory breakdowns; recent updates with links to `/projects/:id`; the projects table/list with its filters (city, category, stage, status, search — whatever the old page wires to `useListProjects` params); create-project dialog (`useCreateProject` + `useListUsers` for investor select + `useListTemplates` for pipeline select + query invalidations incl. `getGetDashboardQueryKey`); CSV export (`exportPortfolio`) if present; role-conditional actions (TM is read-only — no create/export mutations for TM if the old page gates them).

**Design brief:** management home. Page heading `text-2xl font-display`; a KPI strip (bordered stat blocks in one row — not the banned hero-metric card grid: quiet numbers `text-3xl font-display`, labels in `text-sm text-muted-foreground`, no gradient accents); charts via `components/ui/chart.tsx` using `var(--chart-N)` only (status donut or bars, city bars, category bars); recent-updates list; the projects table with the existing shadcn `table.tsx`. Loading = skeletons mirroring final layout; empty portfolio state teaches ("create your first project" for PM/admin). Link the pipeline-ish chart/section to `/reports` (added in Task 7 — use plain `<Link href="/reports">`; nav item arrives with Task 7, dead link is not acceptable, so add this link only if Task 7 is already merged — otherwise leave it for Task 7's step).

- [ ] **Step 1:** Read old `dashboard.tsx` fully; write the capability inventory.
- [ ] **Step 2:** Rebuild per brief + digest.
- [ ] **Step 3:** Per-page gate check (login as PM or admin; verify charts render with token colors, RTL mirrors the table and KPI strip, pagination/chevron glyphs flip).
- [ ] **Step 4: Commit** — `git commit -m "feat(ui): rebuild management dashboard on the new identity"`

---

### Task 6: Page 3 — Investor pipeline (rebuild of my-projects)

**Files:**
- Rewrite: `artifacts/jabeen-portal/src/pages/investor/my-projects.tsx`
- Modify: `src/i18n/locales/{ar,en}.json` (new `investor.pipeline.*` keys), `docs/rtl.md` (icon inventory: the old `ArrowRight` entry moves/updates with the rebuild)

**Functionality inventory to preserve:** `useListProjects` for the investor's own projects; per-project link to `/projects/:id` workspace; derived status display; constructionPct; agreement/plot identifiers; empty state.

**Design brief:** the investor's home — "where does each project stand". Each project renders as a full-width pipeline block (not an identical card grid): header row with project name (`text-xl`), agreement + plot numbers in `font-mono` inside `dir="ltr"` spans, derived-status badge (semantic tinted fill per DESIGN.md policy), constructionPct progress; below, the **stage journey rail**: all stages of the project's pipeline in order, rendered as connected step markers — completed (primary fill + check), current (ring emphasis + `progressBaseline`), upcoming (muted). Stage data comes from `useGetProject(projectId)` per project (`data.pipeline.stages`, `data.currentStage`) — investors typically hold 1–3 projects, so per-card detail fetches are acceptable; render skeleton rails while loading; if `pipeline` is null (unassigned), show a "no pipeline assigned" quiet note. The rail is a flex row — it mirrors automatically in RTL; any connector arrows/chevrons get `.rtl-flip`. Do not hardcode the stage count (seeded template has 7). "View project" affordance with `ArrowRight`+`.rtl-flip` (or `ArrowLeft` semantics handled by the flip). Empty state (no projects) teaches what the portal does.

- [ ] **Step 1:** Read old `my-projects.tsx`; inventory capabilities.
- [ ] **Step 2:** Rebuild per brief + digest.
- [ ] **Step 3:** Per-page gate check (login as `investor1@acmecorp.com`; both dirs; verify the rail order reverses visually in RTL and markers/labels stay legible; numerals stay LTR).
- [ ] **Step 4: Commit** — `git commit -m "feat(ui): rebuild investor home as pipeline journey view"`

---

### Task 7: Page 4 — Reports (new page, route, nav)

**Files:**
- Create: `artifacts/jabeen-portal/src/pages/reports/reports.tsx`
- Modify: `src/app-router.tsx` (route), `src/components/layout/sidebar-nav.tsx` (nav item), `src/i18n/locales/{ar,en}.json` (`nav.reports` + `reports.*`)

**Data wiring (hooks generated in Task 2):** `useGetReportsDistribution` + `getGetReportsDistributionQueryKey`, `useGetReportsStageConversion` (+ key, `{ templateId }` param object), `useGetReportsActivity` (+ key, `{ months }`), `useListTemplates` + `getListTemplatesQueryKey` for the template selector.

- [ ] **Step 1: Route** in `app-router.tsx` (import `ReportsPage from "@/pages/reports/reports"`), placed after the dashboard route:

```tsx
<Route path="/reports">
  <ProtectedRoute allowedRoles={["project-manager", "top-management", "administrator"]}>
    <AppLayout><ReportsPage /></AppLayout>
  </ProtectedRoute>
</Route>
```

- [ ] **Step 2: Nav item** in `sidebar-nav.tsx` right after the dashboard entry (import `BarChart3` from lucide-react):

```tsx
{
  title: t("nav.reports"),
  href: "/reports",
  icon: BarChart3,
  show: role !== "investor",
},
```

- [ ] **Step 3: i18n keys** — add to `en.json`:

```json
"nav": { "reports": "Reports" },
"reports": {
  "title": "Reports",
  "subtitle": "Portfolio analytics across stages, cities, and categories",
  "distribution": {
    "title": "Project distribution",
    "byStage": "By stage",
    "byCity": "By city",
    "byCategory": "By category",
    "unstaged": "No stage assigned",
    "total": "Total projects"
  },
  "conversion": {
    "title": "Stage conversion",
    "template": "Pipeline template",
    "atStage": "Currently at stage",
    "reached": "Reached stage",
    "ofProjects": "of {{count}} projects"
  },
  "activity": {
    "title": "Activity over time",
    "range": "Time range",
    "months_one": "{{count}} month",
    "months_other": "{{count}} months",
    "projectsCreated": "Projects created",
    "updatesSubmitted": "Updates submitted",
    "updatesApproved": "Updates approved"
  },
  "empty": "No data to report yet",
  "error": "Could not load this report"
}
```

and the same tree to `ar.json`:

```json
"nav": { "reports": "التقارير" },
"reports": {
  "title": "التقارير",
  "subtitle": "تحليلات المحفظة حسب المراحل والمدن والفئات",
  "distribution": {
    "title": "توزيع المشاريع",
    "byStage": "حسب المرحلة",
    "byCity": "حسب المدينة",
    "byCategory": "حسب الفئة",
    "unstaged": "بدون مرحلة محددة",
    "total": "إجمالي المشاريع"
  },
  "conversion": {
    "title": "معدل الانتقال بين المراحل",
    "template": "قالب المراحل",
    "atStage": "في هذه المرحلة حاليًا",
    "reached": "وصلت إلى المرحلة",
    "ofProjects": "من أصل {{count}} مشروع"
  },
  "activity": {
    "title": "النشاط عبر الزمن",
    "range": "النطاق الزمني",
    "months_one": "شهر واحد",
    "months_two": "شهران",
    "months_few": "{{count}} أشهر",
    "months_many": "{{count}} شهرًا",
    "months_other": "{{count}} شهر",
    "projectsCreated": "مشاريع منشأة",
    "updatesSubmitted": "تحديثات مرسلة",
    "updatesApproved": "تحديثات معتمدة"
  },
  "empty": "لا توجد بيانات للتقرير بعد",
  "error": "تعذر تحميل هذا التقرير"
}
```

(Merge into the existing `nav` object rather than duplicating it. Arabic plural forms: i18next uses `one/two/few/many/other` for ar.)

- [ ] **Step 4: Build the page** per digest. Layout: page heading (`text-2xl font-display`) + subtitle; three sections in vertical rhythm (not a uniform card grid): **Distribution** — three charts (stage bars ordered by `orderIndex` + the `unstaged` bucket appended, city bars, category bars) via `chart.tsx` and `var(--chart-N)`; **Conversion** — template `Select` (from `useListTemplates`, default = the `isDefault` template) + a horizontal funnel: per stage a full-width row with stage name, `reached` bar (primary, width = `reachedPct%` via inline `style={{inlineSize: pct + "%"}}` or logical-safe width), `atStage` count chip; **Activity** — months `Select` (3/6/12/24) + line/area chart of the three series (chart-1/2/4). All three sections: skeleton loading, `reports.empty` when total is 0, `reports.error` on query error. Numerals stay LTR.
- [ ] **Step 5:** Restart app container (new files), per-page gate check (PM + both dirs; charts must not render physical-anchored tooltips broken in RTL — recharts tooltips are fine as-is; verify).
- [ ] **Step 6: Commit** — `git commit -m "feat(ui): reports page with distribution, conversion funnel, and activity charts"`

---

### Task 8: Page 5 — Settings (rebuild)

**Files:**
- Rewrite: `artifacts/jabeen-portal/src/pages/settings/settings.tsx`
- Modify (if new keys): `src/i18n/locales/{ar,en}.json`

**Functionality inventory to preserve (read the old file first):** whatever `GET /settings` / `PUT /settings` expose today (status thresholds `stalledDays` / `delayedDays` and any other settings fields the old page edits), validation, save with success/error toasts, admin-only access unchanged.

**Design brief:** calm Notion-like settings form on `surface`: one section per setting group, `text-2xl font-display` page heading, `Field`/`Label`/`Input` vocabulary, numeric inputs with units in `text-muted-foreground`, sticky-free simple save `Button` with loading state and dirty-state awareness (disable save when unchanged if the old page did; otherwise keep old behavior). Error/success via existing toast system.

- [ ] **Step 1:** Read old `settings.tsx`; inventory capabilities.
- [ ] **Step 2:** Rebuild per brief + digest.
- [ ] **Step 3:** Per-page gate check (login as admin; save a threshold change and verify it persists; both dirs).
- [ ] **Step 4: Commit** — `git commit -m "feat(ui): rebuild settings page on the new identity"`

---

### Task 9: Page 6a — Admin panel: users, cities, categories (rebuild)

**Files:**
- Rewrite: `artifacts/jabeen-portal/src/pages/admin/users.tsx`, `pages/admin/cities.tsx`, `pages/admin/categories.tsx`
- Modify (if new keys): `src/i18n/locales/{ar,en}.json`; `docs/rtl.md` if new directional glyphs

**Functionality inventory to preserve (read each old file first):** users — list/search/filter, create user (role select, investor company fields, PM city assignment via `/users/{id}/cities`), edit, reset password, activate/deactivate, MFA reset, role badges; cities & categories — full CRUD with validation and in-use guards (API returns 4xx when deleting in-use — surface the error). All existing role gating (`/users` visible to PM/TM/admin — TM read-only; cities/categories admin-only).

**Design brief:** dense admin tables done exceptionally: shadcn `table.tsx` with `muted-surface` stripes/headers per DESIGN.md, `font-mono` for emails/IDs where appropriate, role/status as tinted badges, row actions in a `dropdown-menu` (add `.rtl-flip` to its chevrons if any — registry cleanup-candidates note applies), dialogs for create/edit using the shared form vocabulary. Empty and loading (skeleton rows) states per table.

- [ ] **Step 1:** Read the three old files; inventory capabilities per file.
- [ ] **Step 2:** Rebuild the three files per brief + digest.
- [ ] **Step 3:** Per-page gate check on all three (admin login; exercise one create + one edit + one destructive guard; both dirs).
- [ ] **Step 4: Commit** — `git commit -m "feat(ui): rebuild admin users, cities, and categories pages"`

---

### Task 10: Page 6b — Admin panel: templates + template-builder (rebuild)

**Files:**
- Rewrite: `artifacts/jabeen-portal/src/pages/admin/templates.tsx`, `pages/admin/template-builder.tsx`
- Modify (if new keys): `src/i18n/locales/{ar,en}.json`; `docs/rtl.md` (the registry lists `template-builder.tsx` `ArrowLeft` back button — keep `.rtl-flip`)

**Functionality inventory to preserve (read both old files first — the builder is the most complex page in the app):** templates list (stage counts, default badge, version numbers, archive action, create template → navigate to builder); builder — full stage/field editing (add/remove/reorder stages, per-stage fields with baseType/widget/required/options/position, progress baselines, category), save via `PUT /templates/{id}` (replace semantics — creates a new version when the template was ever assigned; surface that behavior exactly as today), back navigation. Preserve every field-widget mapping in the editor.

**Design brief:** the builder is a working surface, not a showcase: two-pane composition (stage list rail + selected-stage field editor) using logical properties (`ms-`/`border-s`); reorder affordances with direction-neutral grip icons; the stage `category` shown as tinted badges; keep interactions keyboard-reachable. Templates list follows the same table vocabulary as Task 9.

- [ ] **Step 1:** Read both old files; write a **complete** capability inventory (every mutation, every widget type).
- [ ] **Step 2:** Rebuild per brief + digest.
- [ ] **Step 3:** Per-page gate check (admin; create a scratch template, add a stage + two field types, save, reopen, archive it; both dirs).
- [ ] **Step 4: Run the full suite on a fresh DB** — template versioning is destructive-test territory: `down -v && up -d`, then `node .docker-run/test-suite.mjs` (expect 148/0).
- [ ] **Step 5: Commit** — `git commit -m "feat(ui): rebuild pipeline templates list and template builder"`

---

### Task 11: De-DGA sweep of non-rebuilt pages

**Files:**
- Modify: `pages/projects/project-workspace.tsx`, `pages/projects/tabs/{overview,updates,documents,messages,internal-notes,manage}-tab.tsx` (note: the actual filenames are `overview-tab.tsx`, `updates-tab.tsx`, `documents-tab.tsx`, `messages-tab.tsx`, `internal-notes-tab.tsx`, `manage-tab.tsx`), `pages/profile/profile.tsx`, `pages/audit/audit-log.tsx`

This is a **mechanical component swap**, not a redesign: layout and behavior stay; only the DGA wrappers and any DGA-era styling go. Read each dga-* wrapper first (`src/components/ui/dga-*.tsx`) to map props faithfully:

| DGA wrapper | Replacement |
|---|---|
| `DgaContentCard` (dga-card) | `Card`/`CardContent` (ui/card) or a plain `surface` container — match the old padding/border intent |
| dga-brand-button exports | `Button` with the matching variant (default / outline / destructive) and preserved onClick/disabled/loading |
| dga-modal exports | `Dialog` family (ui/dialog) with same open/close wiring |
| dga-text-field exports | `Input` + `Label` (or `Field`) with same value/onChange/error display |
| dga-form exports | existing `Form` (ui/form) or plain form markup matching current submit handling |
| dga-fields exports | `Select` / `Checkbox` / `RadioGroup` / `Textarea` / `Switch` per widget type |

- [ ] **Step 1:** Read the six dga-* wrappers and note each export's props contract.
- [ ] **Step 2:** Swap file-by-file (workspace tabs one at a time), keeping diffs minimal. After each file: `grep -n "components/ui/dga-" <file>` → no matches.
- [ ] **Step 3:** Gates 1–3 of the per-page gate check apply to the touched files (token-only colors, logical properties, no dga imports). Gate 4 (preview): open a project workspace as PM — exercise all five tabs (submit-update form in manage/updates flow, upload UI presence in documents, message send box, notes) — plus profile and audit-log pagination, in both dirs.
- [ ] **Step 4:** Typecheck + i18n parity (should be unchanged).
- [ ] **Step 5: Commit** — `git commit -m "refactor(ui): replace remaining DGA wrappers with native components"`

---

### Task 12: DGA teardown

Precondition: `grep -rn "components/ui/dga-\|platformscode" artifacts/jabeen-portal/src --include="*.tsx" --include="*.ts" | grep -v "components/ui/dga-\w*.tsx:"` shows **no consumers** outside the wrapper files themselves (plus `main.tsx`/`dga-layer-guard`, removed here).

**Files:**
- Delete: `src/components/ui/dga-{brand-button,card,fields,form,modal,text-field}.tsx` (6), `src/styles/jabeen-dga-brand.css`, `src/lib/dga-layer-guard.ts`
- Modify: `src/main.tsx`, `src/index.css`, `artifacts/jabeen-portal/vite.config.ts`, `artifacts/jabeen-portal/package.json`, `pnpm-lock.yaml` (regenerated)

- [ ] **Step 1: Delete the files** listed above (`git rm`).
- [ ] **Step 2: `src/main.tsx`** — remove `import { installDgaLayerGuard } from "@/lib/dga-layer-guard";` (line ~5), `import "@/styles/jabeen-dga-brand.css";` (line ~15), and the `installDgaLayerGuard()` call.
- [ ] **Step 3: `src/index.css`** — change line 4 `@layer dga, theme, base, components, utilities;` → `@layer theme, base, components, utilities;`. Also grep the file for any remaining `dga` references and remove them.
- [ ] **Step 4: `vite.config.ts`** — delete the `dgaCssInLayer()` function (with its comment block) and its entry in `plugins`.
- [ ] **Step 5: `package.json`** — remove `platformscode-new-react` (and any `@platformscode/*` entry) from `artifacts/jabeen-portal/package.json` dependencies. Check: `grep -rn "platformscode" artifacts/jabeen-portal/package.json` → none.
- [ ] **Step 6: Regenerate `pnpm-lock.yaml` inside the container** (Replit frozen-lockfile requirement; never regen on the Windows host):

```bash
docker cp artifacts/jabeen-portal/package.json jabeen-run-app-1:/app/artifacts/jabeen-portal/package.json
docker exec jabeen-run-app-1 bash -lc "cd /app && pnpm install --lockfile-only"
docker cp jabeen-run-app-1:/app/pnpm-lock.yaml pnpm-lock.yaml
```

Verify: `git diff pnpm-lock.yaml` removes the `platformscode-new-react` / `@platformscode` entries and nothing unrelated churns.

- [ ] **Step 7: Rebuild the image and boot-verify** (vite.config + package.json are NOT bind-mounted):

```bash
docker compose -f .docker-run/docker-compose.yml down -v
docker compose -f .docker-run/docker-compose.yml build app
docker compose -f .docker-run/docker-compose.yml up -d
```

Then preview: login page renders themed, no console errors, `grep -rn "platformscode\|dga-" artifacts/jabeen-portal/src` → nothing.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: remove DGA design system (components, CSS layer, Vite plugin, dependency)"
```

---

### Task 13: Phase pass verification + PR

- [ ] **Step 1: Full verification battery**, each suite on a freshly seeded DB:

```bash
docker compose -f .docker-run/docker-compose.yml down -v && docker compose -f .docker-run/docker-compose.yml up -d
node .docker-run/test-suite.mjs      # expect 148/0
docker compose -f .docker-run/docker-compose.yml down -v && docker compose -f .docker-run/docker-compose.yml up -d
node .docker-run/test-branding.mjs   # expect 18/18
docker compose -f .docker-run/docker-compose.yml down -v && docker compose -f .docker-run/docker-compose.yml up -d
node .docker-run/test-reports.mjs    # expect all pass
docker exec jabeen-run-app-1 bash -lc "cd /app && pnpm exec tsc --build --force && pnpm run typecheck"   # clean
```

- [ ] **Step 2: Whole-app RTL/LTR spot pass** in preview (login → dashboard → reports → pipeline (investor) → settings → users → templates), both languages, light + dark (`preview_resize` colorScheme), screenshots of dashboard + reports + pipeline in both dirs.
- [ ] **Step 3: RTL sweep re-run** over the rebuilt files (Gate 2 grep across `src/pages` and touched components) — zero unexplained physical properties; `docs/rtl.md` updated where intentional.
- [ ] **Step 4:** Update `docs/rtl.md` icon inventory for the rebuilt pages (file:line references will have moved).
- [ ] **Step 5: Push and open a PR** to `main` (squash-merge repo):

```bash
git push -u origin claude/dreamy-dubinsky-3e53ea
gh pr create --base main --title "Redesign Phase D: structure & build — six pages rebuilt, reports backend, DGA removed" --body "<summary per template: scope, gates, test evidence>"
```

---

## Self-review notes (writing-plans checklist)

- **Spec coverage:** §Planning (init/shape) → Task 1 + the Shape section; §Reports backend first → Tasks 2–3; §Page rebuild in order → Tasks 4–10 (login → dashboard → pipeline → reports → settings → admin); per-page gates → shared gate procedure enforced per task; DGA teardown at end (recorded Phase B amendment) → Tasks 11–12; pass condition → Task 13.
- **Deliberate deviations:** (a) page tasks carry design briefs + capability contracts instead of full page code — impeccable craft owns visual composition at execution time; data wiring, routes, i18n keys, and gates are pinned here. (b) impeccable live-mode config skipped (preview_* tools are this repo's verification path). (c) "Six lifecycle stages" read as data-driven (seed has seven) — flagged in Shape.
- **Type consistency:** hook names follow orval's `use<OperationId>` / `get<OperationId>QueryKey` pattern generated from the operationIds defined in Task 2; response field names in tests (Task 2) match the schemas (Task 2) and route payloads (Task 3) exactly: `total/unstaged/byStage/byCity/byCategory` (byStage items: `stageId,stageName,templateId,templateName,orderIndex,count`), `templateId/templateName/totalProjects/stages[].{stageId,name,orderIndex,atStage,reached,reachedPct}`, `months[].{month,projectsCreated,updatesSubmitted,updatesApproved}`.

**Post-review amendment (Task 2 quality review, adopted):** `ReportDistribution.byStage` items carry `templateId`/`templateName` (required) so multi-template deployments don't interleave ambiguously; report paths document 400/404 responses; test suite additionally asserts byCategory sum, byStage template linkage, and reachedPct sanity. Task 3's route code above reflects this. Task 3 must validate `months` integer-ness explicitly (generated zod uses `coerce.number()` without `.int()` — an orval limitation).

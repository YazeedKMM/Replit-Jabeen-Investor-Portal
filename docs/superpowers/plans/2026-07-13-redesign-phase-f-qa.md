# Phase F — QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit every rebuilt page for WCAG AA, responsive (mobile/tablet/desktop), dark mode, and RTL correctness; run the combined white-label×RTL+favicon test; produce a QA report and fix every finding (or explicitly defer with rationale) so the report closes clean.

**Architecture:** Discovery-driven. An audit stage (automated sweeps + `web-design-guidelines` code review + live preview inspection across breakpoints/themes/directions) produces a categorized QA report at `docs/qa/2026-07-13-phase-f-qa-report.md`. A fix stage addresses findings grouped by surface, each re-verified in AR+EN, light+dark, and at the failing breakpoint. A dedicated task exercises the white-label×RTL adaptation. Frontend-only; no backend/API/db changes (per spec "Out of scope"). The QA report is a committed deliverable.

**Tech Stack:** React 19 + Tailwind 4 + Vite (`artifacts/jabeen-portal`). Theming via OKLCH tokens + `ThemeProvider` (branding from `GET /branding`). Verification via the Browser-pane dev server already serving `http://localhost:5173` (container `jabeen-run-app-1`) + `pnpm typecheck`. No frontend unit-test/axe framework exists — accessibility is audited via the `web-design-guidelines` + `impeccable` skills, DOM/aria inspection (`read_page`), and JS-computed contrast in the preview; the backend integration suite runs at the end as a regression guard.

---

## Context an implementer needs (read before Task 1)

**This is the final QA phase of the redesign** (spec `docs/superpowers/specs/2026-07-05-...§Phase F`). Prior phases shipped: A+B (OKLCH identity + white-label theming, PR #3), C (RTL audit, PR #4), D (6 pages rebuilt + reports backend + DGA removed, PR #5), E (motion polish + 4 hardened focus areas, PR #6). This branch (`claude/redesign-phase-f-qa`) is stacked on Phase E.

**The rebuilt pages (Phase F audit scope — the spec's "every rebuilt page"):**
1. `pages/auth/login.tsx` (+ `mfa-verify.tsx`, `mfa-setup.tsx`) — pre-auth, must theme before login
2. `pages/dashboard/dashboard.tsx` — manager KPIs, charts, project table
3. `pages/investor/my-projects.tsx` — investor pipeline
4. `pages/reports/reports.tsx` — manager reports + charts
5. `pages/settings/settings.tsx`
6. `pages/admin/*` — `branding.tsx`, `users.tsx`, `cities.tsx`, `categories.tsx`, `templates.tsx`, `template-builder.tsx`
7. **App shell** (appears on every page): `components/layout/*` (header, sidebar-nav, notification-panel), `components/ui/toast.tsx`

**Known infrastructure (do not re-audit as if unknown):**
- **Token palette contrast is already proven.** `DESIGN.md` §Contrast tabulates measured WCAG ratios for every token pair in light AND dark — all pass AA (most pass AAA). So **any text using theme tokens (`text-foreground`, `text-muted-foreground`, `bg-primary`/`text-primary-foreground`, `text-destructive`, etc.) already meets contrast by construction.** Contrast risk lives ONLY in non-token colors.
- **RTL app-page CSS is clean** (Phase C baseline, re-confirmed 2026-07-13): every physical directional utility (`slide-in-from-left/right`, `left-`/`right-`) is inside `components/ui/*` Radix primitives and is intentional/direction-correct per `docs/rtl.md`. Do not "fix" those.
- **Motion** is reduced-motion-safe + dir-aware per `docs/motion.md` (Phase E).

**Seeded automated findings (captured 2026-07-13, starting point for the report):**
- **Stale-theme (non-token palette colors):**
  - IN-SCOPE (shared surfaces on rebuilt pages): `components/ui/toast.tsx:78` (`group-[.destructive]:text-red-300/…ring-red-400/…ring-offset-red-600` — should derive from the `destructive` token); `components/layout/notification-panel.tsx:34-37` (icon colors `text-blue-500`/`text-purple-500`/`text-amber-500` — the notification panel opens from the header on every page).
  - OUT-OF-SCOPE (un-rebuilt feature area — see Scope decision): `pages/projects/project-workspace.tsx` + `pages/projects/tabs/*` carry hardcoded `purple`/`blue`/`amber` (`internal-notes-tab`, `overview-tab`, `updates-tab`, `manage-tab`). These pages were NOT rebuilt in Phase D.
- RTL: none in app pages.

**Scope decision (make this explicit in the report):** Phase F audits and fixes the **rebuilt pages + shared app-shell surfaces** (the spec's scope). The `pages/projects/project-workspace.tsx` + `tabs/*` stale-theme is a real finding but those pages are a **pre-redesign, un-rebuilt feature area**; fixing them is a rebuild, not a QA fix. Document them in the report's "Deferred (out of scope)" section with the file:line list above and flag a follow-up task — do not expand Phase F into rebuilding them. If the white-label×RTL test (Task 7) routes through the workspace, note the stale colors there as expected-deferred.

### Preview verification protocol (referenced by audit/fix tasks)

- The stack already serves `http://localhost:5173` detached. Attach the browser with `preview_start { url: "http://localhost:5173/<path>" }` (NOT `{name}` — avoids the port-5173 fight). First visit to a new route triggers Vite dep-optimization that can swallow the first interaction — re-navigate once.
- **`computer{screenshot}` times out (~30s) in this env — do NOT rely on it.** Use `read_page` (structure/aria), `get_page_text` (copy), and `javascript_tool` returning JSON (computed styles, contrast, dir/lang, class presence) as evidence. These are reliable.
- **Language:** switch via the in-app header switcher (the `العربية`/`EN` button) — setting `localStorage i18nextLng` does NOT switch. `ar` → RTL, `en` → LTR; confirm `document.documentElement.dir`.
- **Theme:** toggle via the header `ThemeToggle`, or `javascript_tool` → `document.documentElement.classList.toggle('dark')`.
- **Breakpoints:** `resize_window` with preset `mobile` (375×812), `tablet` (768×1024), `desktop` (1280×800). After resize, `read_page`/`javascript_tool` to check for horizontal overflow: `document.documentElement.scrollWidth > document.documentElement.clientWidth` must be **false** (no body-level horizontal scroll).
- **Auth-gated pages:** investors log in directly (`investor1@acmecorp.com` / `Investor@2026!`); staff need MFA (TOTP). Mint a token with the scratchpad pattern from Phase E (`scripts` copy of `totp()` from `.docker-run/test-suite.mjs`) and inject `localStorage.setItem('jabeen_access_token', <token>)`. For an empty-investor state, admin `POST /users {role:investor}` (created active) then direct-login.
- **Contrast check in preview (JS):** for a suspect text node, compute contrast from `getComputedStyle(el).color` vs its background via the standard WCAG relative-luminance formula. Only needed for NON-token colors; token pairs are pre-proven in DESIGN.md.

### Per-task closing steps

- If any `.tsx`/`.css` changed: `docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm typecheck"` → exit 0. (Portal-package gate; the root `pnpm typecheck` has an unrelated pre-existing `scripts/seed.ts` failure — ignore it.)
- Commit with a conventional message scoped to the task.

---

## Task 1: QA report skeleton + scope + automated sweeps

Create the QA report deliverable and lock the scope, seeded with the automated findings.

**Files:**
- Create: `docs/qa/2026-07-13-phase-f-qa-report.md`

- [ ] **Step 1: Create the report structure**

Create `docs/qa/2026-07-13-phase-f-qa-report.md` with these sections:
- **Scope** — the rebuilt-pages + app-shell list above; the explicit Scope decision (project-workspace deferred).
- **Method** — `web-design-guidelines` + `impeccable` code audit; live preview at mobile/tablet/desktop × light/dark × LTR/RTL; JS-computed contrast for non-token colors; DESIGN.md token-contrast baseline; no axe framework available.
- **Findings** — a table: `ID | Page/surface | Dimension (WCAG-AA / RTL / responsive / dark / stale-theme / perf) | Severity (blocker/major/minor) | Description (file:line) | Status (open/fixed/deferred)`.
- **Deferred (out of scope)** — the project-workspace/tabs stale-theme list.
- **White-label×RTL test result** — filled by Task 7.
- **Sign-off** — filled by Task 8.

- [ ] **Step 2: Seed the findings table**

Add the automated stale-theme findings (from the context section) as rows: toast.tsx:78 (stale-theme, major, IN-SCOPE), notification-panel.tsx:34-37 (stale-theme, minor, IN-SCOPE). Add the project-workspace/tabs list to the Deferred section. Record "RTL app pages: clean (re-confirmed)".

- [ ] **Step 3: Re-run the sweeps to confirm nothing shifted**

```bash
# stale-theme: non-token palette colors in the IN-SCOPE surfaces
grep -rnE "(text|bg|border|ring|fill|stroke)-(red|orange|amber|yellow|green|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|zinc|neutral|slate)-[0-9]" artifacts/jabeen-portal/src/pages/{auth,dashboard,investor,reports,settings,admin} artifacts/jabeen-portal/src/components/layout artifacts/jabeen-portal/src/components/ui/toast.tsx --include=*.tsx
```
Record every hit as a finding row (this is the authoritative in-scope stale-theme list — the audit tasks add WCAG/responsive/dark findings on top).

- [ ] **Step 4: Commit**

```bash
git add docs/qa/2026-07-13-phase-f-qa-report.md
git commit -m "docs(qa): Phase F QA report skeleton + scope + automated stale-theme findings"
```

---

## Task 2: Static code audit (web-design-guidelines) across rebuilt pages

Review the rebuilt-page source for accessibility/semantics/responsive issues that are visible in code, appending findings to the report.

**Files:**
- Modify: `docs/qa/2026-07-13-phase-f-qa-report.md`

- [ ] **Step 1: Run the web-design-guidelines skill**

Invoke `anthropic-skills:web-design-guidelines` (and `impeccable` audit guidance). Review these files for guideline compliance — focus on issues checkable in code:
- Semantics: heading order, landmark/`main`/`nav`, `button` vs `div`-onClick, `label`/`htmlFor`, `alt` text, `aria-*` correctness.
- Interactive: focus-visible present, keyboard operability, target size (Phase D added a `@media (pointer:coarse)` 44px rule in index.css — confirm it covers icon-only controls), `aria-live` on async status.
- Forms: every input labelled + error wired via `aria-describedby` (Phase D/E pattern), `aria-invalid`.
- Responsive: tables/charts/wide content in an `overflow-x-auto` container; no fixed pixel widths that force body overflow at 375px.
- Images/charts: chart containers pinned `dir="ltr"` (per `docs/rtl.md`) with HTML legends outside; decorative icons `aria-hidden`.
Files: `pages/auth/login.tsx`, `pages/dashboard/dashboard.tsx`, `pages/investor/my-projects.tsx`, `pages/reports/reports.tsx`, `pages/settings/settings.tsx`, `pages/admin/{users,branding,cities,categories,templates,template-builder}.tsx`, `components/layout/*`, `components/ui/toast.tsx`.

- [ ] **Step 2: Record findings**

Append each finding to the report table with file:line, dimension, severity, and a concrete fix recommendation. If a file is clean, note it (so the audit is demonstrably complete, not skipped). Base every finding on code actually read — no speculative entries.

- [ ] **Step 3: Commit**

```bash
git add docs/qa/2026-07-13-phase-f-qa-report.md
git commit -m "docs(qa): static code audit findings (web-design-guidelines)"
```

---

## Task 3: Live preview audit — responsive × dark × RTL

Inspect each rebuilt page in the running app across breakpoints, themes, and directions; append findings.

**Files:**
- Modify: `docs/qa/2026-07-13-phase-f-qa-report.md`

- [ ] **Step 1: Audit the pre-auth surface (no token needed)**

`preview_start { url: "http://localhost:5173/login" }`. For each of {mobile 375, tablet 768, desktop 1280} × {light, dark} × {EN/LTR, AR/RTL}:
- No horizontal body overflow: `javascript_tool` → `document.documentElement.scrollWidth <= document.documentElement.clientWidth` (expect true).
- Brand mark/logo present and legible; heading hierarchy intact (`read_page`).
- In dark mode, confirm surfaces use tokens (no white flashes): sample `getComputedStyle(document.body).backgroundColor`.
Record any overflow/dark/RTL break as a finding.

- [ ] **Step 2: Audit the auth-gated pages**

Mint an admin token and an investor token (Phase E scratchpad pattern; `.docker-run/test-suite.mjs` has the TOTP + login helpers). Inject the token and audit at the three breakpoints × light/dark × EN/AR:
- Admin token → `/dashboard`, `/reports`, `/settings`, `/admin/users`, `/branding` (+ spot-check `cities`, `categories`, `templates`).
- Investor token → `/my-projects`.
For each: no horizontal overflow at 375px; tables/charts scroll within their own container (not the body); dark-mode surfaces tokenized; RTL alignment (labels, table headers `text-start`, chart panels mirror while the chart SVG stays `dir=ltr`); focus-visible on primary controls (`javascript_tool`: focus an element, read `getComputedStyle(el).outline`/`boxShadow`).
Record findings with page + breakpoint + theme + direction.

- [ ] **Step 3: JS contrast spot-checks on non-token colors**

For each in-scope stale-theme hit still present (e.g. notification-panel icons, toast destructive), compute WCAG contrast in the preview (relative-luminance formula on computed `color` vs background). Record pass/fail; a fail escalates that finding's severity.

- [ ] **Step 4: Commit**

```bash
git add docs/qa/2026-07-13-phase-f-qa-report.md
git commit -m "docs(qa): live preview audit findings (responsive/dark/RTL)"
```

---

## Task 4: Fix in-scope stale-theme findings

Convert the seeded + audited in-scope stale-theme colors to theme tokens so they follow branding and dark mode.

**Files:**
- Modify: `components/ui/toast.tsx`, `components/layout/notification-panel.tsx` (+ any other in-scope files flagged in Tasks 1-3)
- Modify: `docs/qa/2026-07-13-phase-f-qa-report.md` (mark rows fixed)

- [ ] **Step 1: Toast destructive → tokens**

In `components/ui/toast.tsx:78`, replace the `group-[.destructive]:text-red-300 / …ring-red-400 / …ring-offset-red-600` close-button colors with the destructive token equivalents (the destructive variant already sets `bg-destructive text-destructive-foreground`; the close button should derive from `text-destructive-foreground/50` + `hover:text-destructive-foreground` + `focus:ring-destructive`-style tokens, matching the pattern used elsewhere). Keep the non-destructive close-button styles unchanged. Verify the toast still reads correctly in light+dark.

- [ ] **Step 2: Notification-panel icons → semantic tokens**

In `components/layout/notification-panel.tsx:34-37`, replace `text-blue-500`/`text-purple-500`/`text-amber-500`/`text-blue-500` with theme tokens. Map to the semantic vocabulary: informational → `text-secondary`, attention/pending → `text-warning`, success/approved → `text-success`, and a neutral/brand accent (`text-primary` or `text-accent`) for the remaining category. Choose the mapping that reads sensibly per notification type; keep icons `aria-hidden` if decorative.

- [ ] **Step 3: Any other in-scope stale-theme from the audit**

Apply the same token-conversion to any additional in-scope hits the sweeps/audit found. Do NOT touch the deferred project-workspace/tabs files.

- [ ] **Step 4: Verify + typecheck + commit**

Preview: confirm the notification panel (open it from the header) and a destructive toast render with tokenized colors in light AND dark, EN AND AR. `read_page`/`javascript_tool` to confirm computed colors now come from tokens (e.g. the icon color matches `getComputedStyle(document.documentElement).getPropertyValue('--warning')`-derived value, or simply that no `rgb` matching the old palette remains).
```bash
docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm typecheck"
git add artifacts/jabeen-portal/src docs/qa/2026-07-13-phase-f-qa-report.md
git commit -m "fix(portal): tokenize stale-theme colors in toast + notification panel (QA)"
```

---

## Task 5: Fix WCAG/semantic findings

Address the accessibility/semantic findings from Task 2, grouped by page. (Concrete steps depend on Task 2 output — this task is populated from the report; each fix follows the same shape.)

**Files:**
- Modify: the specific rebuilt-page files flagged in the report
- Modify: `docs/qa/2026-07-13-phase-f-qa-report.md`

- [ ] **Step 1: For each WCAG/semantic finding (in report order, blocker→minor)**

Reproduce the issue (read the code / preview), apply the minimal correct fix following the established Phase D/E patterns (labelled inputs, `aria-describedby` error wiring, `aria-hidden` decorative icons, focus-visible rings from tokens, heading order, `scope="col"` on `TableHead`, chart containers `dir=ltr`). Do NOT introduce new patterns where an existing one fits.

- [ ] **Step 2: Re-verify each fix**

In the preview, confirm the fix in EN+AR and light+dark (and the relevant breakpoint if responsive). Use `read_page` to confirm aria/structure. Mark the report row fixed with a one-line note on what changed.

- [ ] **Step 3: Typecheck + commit (batch by page or a few findings per commit)**

```bash
docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm typecheck"
git add artifacts/jabeen-portal/src docs/qa/2026-07-13-phase-f-qa-report.md
git commit -m "fix(portal): <specific WCAG/semantic fix> (QA)"
```

If Task 2/3 found **no** WCAG/semantic issues on a page, that is a valid outcome — record "no findings" in the report and skip its fix.

---

## Task 6: Fix responsive / dark-mode findings

Address the responsive-overflow and dark-mode findings from Task 3. (Populated from the report; each fix same shape.)

**Files:**
- Modify: the specific files flagged; `docs/qa/2026-07-13-phase-f-qa-report.md`

- [ ] **Step 1: For each responsive/dark finding**

Fix horizontal-overflow by wrapping wide content (tables, chart rows, code/ID strings) in `overflow-x-auto` containers or switching fixed widths to fluid/`max-w-full`; fix dark-mode issues by replacing any hard-coded light surface with the `surface`/`card`/`muted` tokens. Re-verify at the failing breakpoint in both themes and directions: `document.documentElement.scrollWidth <= clientWidth` must become true; dark surfaces tokenized.

- [ ] **Step 2: Typecheck + commit**

```bash
docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm typecheck"
git add artifacts/jabeen-portal/src docs/qa/2026-07-13-phase-f-qa-report.md
git commit -m "fix(portal): <specific responsive/dark fix> (QA)"
```

If no responsive/dark findings, record "no findings" and skip.

---

## Task 7: Combined white-label × RTL × favicon test

Exercise the spec's headline QA test: rebrand the deployment while in Arabic/RTL and confirm the whole app — including the pre-auth login page and favicon — adopts the new brand together.

**Files:**
- Modify: `docs/qa/2026-07-13-phase-f-qa-report.md` (result); fix any stale-theme spot that fails to update.

- [ ] **Step 1: Baseline capture (AR/RTL)**

Preview `/login` in AR. `javascript_tool`: capture the resolved brand — `getComputedStyle(document.documentElement).getPropertyValue('--primary')` (and `--secondary`, `--accent`), the favicon href (`document.querySelector('link[rel~=icon]')?.href`), and `document.title`.

- [ ] **Step 2: Rebrand via the admin editor (as admin, in AR/RTL)**

Inject an admin token, go to `/branding` in AR. Change the six brand colors (e.g. shift `primary`/`secondary`/`accent` to visibly different OKLCH values) and save via the editor (`PUT /branding`). If a logo upload is easy to exercise, change the light logo too; otherwise note logos are covered by the API contract test. (Per spec, only the 6 colors + logos are tenant-editable.)

- [ ] **Step 3: Confirm the running app adopts the brand — everywhere, together**

Without a hard reload where possible (ThemeProvider should react), then with a reload:
- Re-read `--primary`/`--secondary`/`--accent` on `/dashboard` and `/my-projects` — they must equal the new values (colors update app-wide, not just the editor).
- Log out / open `/login` fresh in AR — the **pre-auth** page must show the new brand colors + logo (login themes before auth via public `GET /branding`).
- Favicon + `document.title` updated to the new brand.
- Layout still correct in RTL after rebrand (no shift).
Record pass/fail per surface in the report. Any surface that keeps the OLD color is a **stale-theme** finding — fix it (it means that surface hard-codes a color instead of using the token) and re-run this step.

- [ ] **Step 4: Restore the default brand**

`PUT /branding` back to the DESIGN.md default (or reset the DB) so the committed state is the default identity. Confirm `/login` shows the default again.

- [ ] **Step 5: Commit**

```bash
git add docs/qa/2026-07-13-phase-f-qa-report.md artifacts/jabeen-portal/src
git commit -m "test(qa): white-label × RTL × favicon adaptation verified (+ fixes)"
```

---

## Task 8: Final regression, report sign-off, wrap-up

Prove no regression, close the report, and finish the branch.

**Files:** `docs/qa/2026-07-13-phase-f-qa-report.md`; memory; PR.

- [ ] **Step 1: Confirm every finding is fixed or deferred-with-rationale**

Re-read the report. Every row must be `fixed` (with a note) or `deferred` (project-workspace/tabs, with the scope rationale). No `open` rows remain. If any remain, loop back to the relevant fix task.

- [ ] **Step 2: Regression — suites on fresh DBs + typechecks**

Phase F is frontend-only. Reset and run each suite on a fresh DB (they are not isolation-safe when chained):
```bash
docker compose -f .docker-run/docker-compose.yml down -v && docker compose -f .docker-run/docker-compose.yml up -d   # wait for API
node .docker-run/test-suite.mjs        # expect 148/0
# reset again, then:
node .docker-run/test-branding.mjs     # expect 18/18
# reset again, then:
node .docker-run/test-reports.mjs      # expect 31/0
docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm typecheck"   # exit 0
docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/api-server && pnpm typecheck"      # exit 0
```

- [ ] **Step 3: Sign off the report**

Fill the report's Sign-off: dimensions audited, counts (findings found / fixed / deferred), regression evidence, and the statement that the pass condition is met (report clean; all in-scope findings fixed and re-verified; project-workspace deferred with rationale). Commit.

- [ ] **Step 4: Finish the branch**

Invoke `superpowers:finishing-a-development-branch`. Open a PR (`claude/redesign-phase-f-qa` → base = the Phase E branch `claude/redesign-phase-e-polish`, or `main` if #6 has merged by then) summarizing the audit scope, findings fixed, the white-label×RTL result, and the deferred item. Flag the project-workspace stale-theme as a follow-up (spawn_task).

- [ ] **Step 5: Update project memory**

Append `redesign-phase-f.md` (type `project`): Phase F shipped (QA audit + fixes + white-label test + report), branch/PR, the scope decision (project-workspace deferred), key findings + fixes, and that the **redesign is complete** (A–F done). Add the `MEMORY.md` pointer. Link `[[redesign-phase-e]]`, `[[redesign-phase-d]]`.

---

## Self-review

**Spec coverage (§Phase F):**
- "impeccable audit on every rebuilt page: WCAG AA, performance, responsive (mobile/tablet/desktop), dark mode" → Tasks 2 (code) + 3 (live, all breakpoints × themes × directions). ✔
- "Second compliance pass with web-design-guidelines" → Task 2 invokes it explicitly. ✔
- "Combined white-label × RTL test … including the pre-auth login page and favicon" → Task 7 (all sub-surfaces + favicon + login). ✔
- "Deliverable: QA report of WCAG failures, RTL breaks, and stale-theme spots; all fixed before the phase closes" → report created Task 1, populated 2/3, fixed 4/5/6/7, signed off Task 8. ✔
- "Pass condition: QA report clean (or all findings fixed and re-verified)" → Task 8 Step 1 gate + sign-off. ✔
- Performance: the spec lists it; with no perf tooling in-repo, Task 2/3 cover it qualitatively (no obvious over-render/oversized-asset/layout-thrash; charts already lazy where applicable). Documented as a qualitative pass, not a Lighthouse run (noted honestly in the report).

**Scope integrity:** the project-workspace/tabs stale-theme is explicitly deferred with rationale (un-rebuilt pages), not silently dropped — recorded in the report and flagged as a follow-up. Backend untouched (spec "Out of scope").

**Discovery-driven honesty:** Tasks 5/6 are templated because their fixes depend on audit output; each has a defined shape and an explicit "no findings is valid" outcome so an empty audit result doesn't read as skipped work. The seeded stale-theme findings (Task 4) are concrete and independent of the audit.

**Placeholder scan:** audit tasks give exact files, greps, and JS checks; fix tasks give the token-mapping and verification method. The unavoidable openness (which WCAG/responsive findings exist) is structural to a QA phase and bounded by the concrete report format + "no findings valid" rule.

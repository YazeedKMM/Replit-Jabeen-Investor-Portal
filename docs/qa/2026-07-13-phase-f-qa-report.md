# Phase F — QA Report

**Date:** 2026-07-13 · **Branch:** `claude/redesign-phase-f-qa` (stacked on Phase E) ·
**Spec:** `docs/superpowers/specs/2026-07-05-...§Phase F` · **Plan:** `docs/superpowers/plans/2026-07-13-redesign-phase-f-qa.md`

## Scope

Audited surfaces (the spec's "every rebuilt page" + shared app-shell):

1. `pages/auth/login.tsx` (+ `mfa-verify.tsx`, `mfa-setup.tsx`) — pre-auth
2. `pages/dashboard/dashboard.tsx`
3. `pages/investor/my-projects.tsx`
4. `pages/reports/reports.tsx`
5. `pages/settings/settings.tsx`
6. `pages/admin/{branding,users,cities,categories,templates,template-builder}.tsx`
7. App shell (every page): `components/layout/*` (header, sidebar-nav, notification-panel), `components/ui/toast.tsx`

**Dimensions:** WCAG AA, responsive (mobile 375 / tablet 768 / desktop 1280), dark mode, RTL, stale-theme (non-token colors), performance (qualitative).

### Scope decision — deferred

`pages/projects/project-workspace.tsx` + `pages/projects/tabs/*` (overview, updates, manage, internal-notes, messages, documents) are a **pre-redesign, un-rebuilt feature area** — they were not among the six pages rebuilt in Phase D. They carry hardcoded `purple`/`blue`/`amber` palette colors (list under *Deferred* below). Re-tokenizing them is a page rebuild, not a QA fix, so they are **deferred out of Phase F** and flagged as a follow-up. All in-scope surfaces above are audited and fixed.

## Method

- Static code audit via `anthropic-skills:web-design-guidelines` + `impeccable` audit guidance.
- Live preview at mobile/tablet/desktop × light/dark × LTR/RTL against the running stack (`http://localhost:5173`); DOM/aria via `read_page`, computed styles + contrast + overflow via `javascript_tool`. (`computer{screenshot}` times out in this env — text/JS evidence used instead.)
- Contrast: token pairs are pre-proven AA/AAA in `DESIGN.md` §Contrast (light + dark) — contrast risk assessed only for **non-token** colors, via the WCAG relative-luminance formula on computed colors.
- No axe-core / Lighthouse in-repo; accessibility is skill- + DOM-audited, performance assessed qualitatively.

## Findings

| ID | Surface | Dimension | Severity | Description (file:line) | Status |
|----|---------|-----------|----------|--------------------------|--------|
| F-01 | toast (shared) | stale-theme | major | `components/ui/toast.tsx:78` — destructive close-button used `text-red-300 / hover:text-red-50 / focus:ring-red-400 / ring-offset-red-600` (shadcn palette, not the `destructive` token). | **fixed** (2eda913) — → `text-destructive-foreground/70 hover:text-destructive-foreground focus:ring-destructive-foreground/40` |
| F-02 | notification-panel (shared) | stale-theme | minor | `components/layout/notification-panel.tsx:34-37` — icons used `text-blue-500`/`text-purple-500`/`text-amber-500`. | **fixed** (2eda913) — → `text-secondary`/`text-accent`/`text-warning`/`text-success` |
| F-03 | notification-panel (shared) | semantic (WCAG 2.1.1) | major | `components/layout/notification-panel.tsx:65` — clickable `<div onClick>` with no keyboard support. | **fixed** (2eda913) — added `role="button"` + `tabIndex={0}` + `onKeyDown` (Enter/Space, `preventDefault` on Space) |
| F-04 | toast (shared) | WCAG-AA (4.1.2) | major | `components/ui/toast.tsx:84` — `ToastClose` icon-only, no accessible name. | **fixed** (2eda913) — `aria-hidden` on `<X>` + `<span class="sr-only">{t("common.close")}</span>` |
| F-05 | admin/branding | semantic | minor | `pages/admin/branding.tsx` — `CardTitle` renders a `<div>`; section titles weren't headings. | **fixed** (2eda913) — section titles → real `<h2>` (CardTitle classes preserved) |
| F-06 | admin/branding | WCAG-AA | minor | `pages/admin/branding.tsx:47` — loading spinner had no status semantics. | **fixed** (2eda913) — wrapped in `role="status"` + `sr-only` loading text + `aria-hidden` icon |
| F-07 | notification-panel (shared) | semantic | minor | `components/layout/notification-panel.tsx:46` — panel title `<h4>` (skipped level). | **fixed** (2eda913) — `<h4>` → `<h2>` |

_Static audit (Task 2, web-design-guidelines): the six rebuilt pages + header/sidebar/app-layout audited **CLEAN** — every input labelled + errors wired via `aria-describedby`/`FormMessage`; tables inherit `overflow-auto`; Recharts containers pinned `dir="ltr"` with HTML legends outside; numerals/IDs wrapped `dir="ltr"`; icon-only buttons have `aria-label`; decorative icons `aria-hidden`. Findings cluster only in the two shared surfaces + branding (Card-based)._

### Live preview audit (Task 3) — responsive / dark / RTL: CLEAN

Verified live (`http://localhost:5173`) at **375px mobile**, in **RTL (ar)**, both themes:
- **No body horizontal overflow** on `/login`, `/users`, `/dashboard`, `/reports` (`scrollWidth == clientWidth == 375`). Wide content is contained: the `/users` table (525px) and `/dashboard` table (674px) scroll inside their own `overflow-x-auto` parent; the 6 dashboard / 4 reports Recharts render in responsive containers.
- **Dark mode** (`data-theme="dark"`, `jabeen-theme` in localStorage): body = dark token `oklch(0.165 0.012 140)`; **0** near-white hardcoded surfaces in `main`.
- **Light mode** (`data-theme="light"`): body = light token `oklch(1 0 0)`; **0** dark-stuck surfaces.
- **RTL**: all pages render `dir="rtl"` with correct Arabic headings and mirrored layout.

No responsive / dark-mode / RTL findings on the rebuilt pages → **Task 6 (responsive/dark fixes): no findings**.

### RTL (app pages)

Clean — re-confirmed 2026-07-13. Every physical directional utility (`slide-in-from-left/right`, `left-`/`right-`) is inside `components/ui/*` Radix primitives and is intentional/direction-correct per `docs/rtl.md`. No physical directional CSS in app pages.

## Deferred (out of scope — un-rebuilt project-workspace feature)

Follow-up: re-tokenize when the project workspace is rebuilt. Hardcoded palette colors:
- `pages/projects/project-workspace.tsx:126` — `text-purple-700 dark:text-purple-400` (tab trigger)
- `pages/projects/tabs/internal-notes-tab.tsx:40,52,54,74` — `text-purple-900/300`, `bg-purple-50/900`, `border-purple-*`, `bg-purple-700`
- `pages/projects/tabs/manage-tab.tsx:184` — `text-amber-600`
- `pages/projects/tabs/overview-tab.tsx:51` — `bg-blue-500`
- `pages/projects/tabs/updates-tab.tsx:257,258,734,736,834` — `bg-blue-50/border-blue-200`, `text-blue-700`, `text-blue-500`, `text-amber-500`, `bg-blue-600`

## White-label × RTL × favicon test

_Filled by Task 7._

## Sign-off

_Filled by Task 8._

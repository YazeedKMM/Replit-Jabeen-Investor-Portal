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
| F-01 | toast (shared) | stale-theme | major | `components/ui/toast.tsx:78` — destructive close-button uses `group-[.destructive]:text-red-300 / hover:text-red-50 / focus:ring-red-400 / focus:ring-offset-red-600` (shadcn default palette, not the `destructive` token; won't follow branding/dark) | open |
| F-02 | notification-panel (shared) | stale-theme | minor | `components/layout/notification-panel.tsx:34-37` — notification icons use `text-blue-500` / `text-purple-500` / `text-amber-500` / `text-blue-500` (palette, not semantic tokens; won't follow branding/dark) | open |

_Rows F-03+ appended by the static (Task 2) and live (Task 3) audits._

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

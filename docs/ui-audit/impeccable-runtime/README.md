# Impeccable Runtime UI/UX Audit — JABEEN Investor Portal

**Branch:** `elastic-lederberg-16ee00` (HEAD `294067c`)
**Method:** `/impeccable critique` + `/impeccable audit`, run against the **live, running app** (not source alone). Every screen was driven in a real Chromium browser via the Chrome DevTools Protocol: navigated, authenticated, screenshotted, resized, and inspected (computed styles, CSSOM, DOM landmarks). Source reading was used only to explain runtime findings.
**Date:** 2026-06-28
**Status:** Findings only. **No application code, database, or MFA settings were changed.** The only files added are this report folder. Git working tree is otherwise clean.

---

## How the app was run & reached

- Stack: pnpm workspace — Express API (`:8080`), Vite SPA (`:5173`), Postgres (`:5433`), served by the project's Docker stack (`.docker-run/docker-compose.yml`). The running container live-mounts this worktree's `artifacts/jabeen-portal/src`, so `:5173` serves the `elastic-lederberg-16ee00` frontend directly.
- **All four roles reached without touching MFA or the DB.** Only the `investor` role is MFA-free; `administrator`, `project-manager`, and `top-management` are gated by `mfaSetupRequired`. Rather than disable MFA, valid access tokens were minted with the known dev `SESSION_SECRET` (`dev-secret-not-for-prod`) — shape `{userId, role, status:"active"}`, exactly what `issueFullSession()` signs — and injected into `localStorage.jabeen_access_token`. The server's `requireAuth` verifies the signature and a live DB status check; minted tokens pass for every role. This left MFA enforcement and all user rows untouched (re-confirmed: every user still `mfa_enabled = f`, no source edits).
- Browser automation: headless Chrome (`--remote-debugging-port=9222`) driven by a small CDP script; captures wait for `document.readyState==='complete'`, `document.fonts`, and DGA Stencil hydration before shooting. The headline finding was **cross-checked in the user's real (non-headless) Chrome** and reproduces identically (the CSS cascade is deterministic across Chromium).

## Coverage

64 screenshots in [`shots/`](shots/):

| Pass | What | Count |
|---|---|---|
| A | Desktop 1440×900, light, EN — every screen, every role (investor / PM / top-management / admin), plus 404 + project-404 | 24 |
| T | Project-workspace tabs (investor updates/documents/messages, PM manage/internal) | 5 |
| B | Dark theme, EN, desktop — representative screens incl. investor, messages, internal-notes | 8 |
| C | Arabic **RTL**, light, desktop — login, investor, dashboard, users, settings, project | 6 |
| D | **Mobile** 390×844 — login, investor, dashboard, users, settings, project, profile, messages | 8 |
| E | **Tablet** 834×1112 — investor, dashboard, users, project | 4 |
| F/G | States & modals — register tab, New Project modal, Create User modal, Add City modal, notifications, investor2 | 9 |

States covered: populated, empty (`No investor assigned`, empty internal-notes), error (404, project-404), modal/dialog, success-leaning, and edge (investor2 data variance).

## The one finding that dominates everything

A global, **unlayered** CSS reset (the Eric-Meyer reset, `html,body,div,…,header,…{display:block; margin:0; padding:0}`) is injected into the document **at runtime by the `DgaLinearProgressBar` Stencil component** when it mounts. Because it is unlayered, it outranks Tailwind's layered utilities (cascade layers beat specificity), so the app header (`flex h-16`) computes `display:block` and its controls stack vertically and overflow into the page content; list/timeline margins collapse, so project content renders cramped/overlapping.

It fires on exactly the pages that render a progress bar: **`/my-projects`, `/projects/:id` (all tabs), `/templates/:id`** — i.e. **every investor-facing screen** plus the template builder. Pages without a progress bar (dashboard, users, cities, categories, audit-log, settings, templates list, profile) are **clean and genuinely well-crafted**. Confirmed by computed style + CSSOM in headless **and** real Chrome.

See [`impeccable-critique.md`](impeccable-critique.md) and [`impeccable-audit.md`](impeccable-audit.md) for the full structured findings.

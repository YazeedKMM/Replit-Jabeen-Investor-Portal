# /impeccable critique — JABEEN Investor Portal (runtime)

Register: **product** (design serves the task — authenticated portal, dashboards, tables, forms).
Target: the running app on `:5173`, branch `elastic-lederberg-16ee00`. Evidence: 64 live screenshots in [`shots/`](shots/).

---

## Design Health Score (Nielsen's 10 heuristics)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good status tags / progress / skeletons / toasts. But the broken header on investor & project pages buries the status & controls bar. |
| 2 | Match System / Real World | 3 | Strong domain language (RCJY, lifecycle stages, investor terms); Arabic fully localized. Leaks: `0% % baseline`, raw `authorRole.replace('-',' ')`, dev-facing 404 copy. |
| 3 | User Control & Freedom | 3 | Modals have Cancel; destructive actions confirm; filters clear. No undo; no Esc documented beyond native dialog. |
| 4 | Consistency & Standards | 2 | Staff surfaces are a cohesive system; **investor/project/template-builder surfaces render broken** — a glaring consistency break between what staff see and what investors see. Role-tag colours also inconsistent (investor amber vs others blue). |
| 5 | Error Prevention | 3 | Required-field markers, constrained dropdowns, confirm-before-delete, MFA. |
| 6 | Recognition vs Recall | 3 | Text+icon nav, visible filters/search. Many icon-only action buttons have no accessible name. |
| 7 | Flexibility & Efficiency | 2 | City filter, search, role filter, CSV export. No keyboard shortcuts, no bulk actions, no saved views. |
| 8 | Aesthetic & Minimalist | 2 | Staff pages are clean and minimal; investor/project pages are visually broken (overlapping header + cramped content). Net mixed. |
| 9 | Error Recovery | 2 | Form validation present. 404 shows a developer message; empty/error states thin. |
| 10 | Help & Documentation | 1 | No contextual help, tooltips (beyond `title`), or onboarding. |
| **Total** | | **24/40** | **Acceptable** — a well-built staff product undercut by a systemic rendering defect on the primary (investor) surfaces. |

Read honestly: the *staff* experience alone scores ~30 (Good). The *investor* experience — the product's whole reason to exist — is what pulls the score to Acceptable.

---

## Anti-Patterns Verdict — does this look AI-generated?

**No. It passes the AI-slop test.** This is a distinctive, intentional government-portal identity: the Saudi DGA "Platforms Code" system, JABEEN gold (`#b38916`), IBM Plex Sans Arabic, real RTL, RCJY framing. None of the saturated tells are present.

- **LLM assessment:** No gradient text, no decorative glassmorphism, no hero-metric template, no identical icon-card grid, no tracked-uppercase eyebrow on every section, no cream/sand AI-default palette. Composition is confident and category-appropriate. Dark mode and RTL are first-class, not afterthoughts. The failures here are **bugs and accessibility gaps, not slop.**
- **Deterministic scan (`detect.mjs`):** Effectively clean. Its hits are mostly false positives: `border-b-2` at `project-workspace.tsx:119,122` is the intentional gold active-tab underline (a tab indicator, not a card accent); "numbered section markers 03–08" and "372 em-dashes" both resolve to `index.css` internals, not rendered body copy. The one real hit: **em-dashes do appear in live UI copy** (template-builder version alert, `— No investor yet —` placeholders, settings helper text), which violates the project's own no-em-dash rule.
- **Visual overlays:** Not injected (the detector targets static markup; runtime evidence is the screenshot set instead).

---

## Cognitive Load

Checklist (8 items) on the core investor task (open my project, read status):
- ✅ Chunking, grouping, minimal choices (≤4 KPIs, ≤5 nav items), progressive disclosure (tabs).
- ❌ **Single focus / visual hierarchy / one-thing-at-a-time** all fail on investor & project pages because the broken header overlaps the page title and the pipeline timeline collapses into overlapping rows — the user must visually disentangle stacked, colliding elements.

Result on investor surfaces: **3–4 failures = high extraneous load**, entirely self-inflicted by the reset-bleed bug (pure extraneous load — eliminable). On staff surfaces: 0–1 failures = low load (good).

---

## Emotional Journey

The investor is the high-stakes user: they log in to check millions in industrial investment. Peak-end and first-impression both land on **broken**. The login page is polished and reassuring; the very next screen (`/my-projects`) greets them with a collapsed header and overlapping cards — a confidence valley exactly where reassurance matters most. Staff, by contrast, get a calm, competent dashboard. The portal currently reassures the people who run it and unsettles the people it's for.

---

## What's Working (keep these)

1. **The staff design system is genuinely good.** Dashboard, Users, Cities, Categories, Audit Log, Settings, Templates, Profile: cohesive DGA gold system, consistent cards/tables/tags/forms, clear hierarchy, sensible density. See `shots/A16`, `A17`, `A20`, `A21`, `G01`, `G02`.
2. **Dark theme and RTL are excellent.** Dark mode is consistent and legible (`shots/B03`); Arabic mirrors fully — sidebar flips right, layout/labels/dates localize (`2026/06/12`), status reads `متأخر` (`shots/C03`).
3. **Modals are well-built.** Native `<dialog>` (focus trap + Esc + `::backdrop` for free), grouped fields, required markers, gold CTA, optional-field honesty (`shots/G01`, `G02`).

---

## Priority Issues

### [P0] The global header collapses and content overlaps on every investor-facing page
- **What:** `DgaLinearProgressBar` (light-DOM Stencil) injects an **unlayered** Eric-Meyer reset into the document at mount. Unlayered rules beat Tailwind's layered utilities, so `header.flex` computes `display:block`; the header controls (sidebar toggle, city filter, theme, language, user, notifications) stack vertically and overflow the 64px bar onto the page title. The reset's `margin:0/padding:0` also collapses list spacing, so the project pipeline timeline, chat messages, and internal notes render cramped/overlapping. Fires on `/my-projects`, `/projects/:id` (all tabs), `/templates/:id`.
- **Evidence:** `shots/A02`, `A03`, `T06`, `D02`, `C02`, `A10`; computed `display:block` confirmed in headless **and** real Chrome; CSSOM shows the unlayered reset present only on progress-bar pages, absent on clean pages (`shots/A16`/`A17` headers are correct `flex`).
- **Why it matters:** It hits **100% of investor screens** — the portal's primary audience and purpose — plus the template builder. First impression and core task are both visibly broken.
- **Fix:** Same family the brand CSS already patches for border/padding/anchor/button bleed (`jabeen-dga-brand.css`). Re-assert layout with an **unlayered, higher-specificity** rule for the app shell (e.g. `header.flex{display:flex !important}` scoped to the shell, plus the shell's flex/grid/spacing primitives), **or** stop `DgaLinearProgressBar` leaking the global reset (wrap/replace it, or neutralize its injected `<style>`), **or** register the runtime-injected reset into `@layer dga` (the Vite plugin only catches build-time imports, not Stencil's runtime injection).
- **Suggested command:** `/impeccable adapt` (layout/CSS-architecture repair) → then `/impeccable polish`.

### [P1] No visible keyboard focus indicator, anywhere
- **What:** The DGA reset neutralizes outlines and outranks Tailwind's layered `focus-visible:ring-*`; focused links/buttons render `outline:0` + transparent ring across the app (card links, selects, theme/language toggles, notifications). WCAG 2.4.7.
- **Why it matters:** Keyboard and low-vision users cannot tell where they are. On an authoritative government portal this is both an accessibility failure and a compliance risk.
- **Fix:** Restore an unlayered/`!`-scoped `:focus-visible` ring that beats the reset (same bleed pattern as P0).
- **Suggested command:** `/impeccable adapt`.

### [P1] Pinch-zoom disabled (mobile accessibility)
- **What:** `index.html` viewport meta includes `maximum-scale=1` (confirmed in the served HTML), blocking pinch-zoom. WCAG 1.4.4 Resize Text.
- **Why it matters:** Low-vision mobile users can't enlarge text — serious on a portal with dense tables and Arabic.
- **Fix:** Remove `maximum-scale=1` / any `user-scalable=no`.
- **Suggested command:** `/impeccable adapt`.

### [P2] Data tables are unusable on mobile — Status & Actions clipped off-screen
- **What:** The Users table (and other wide tables) overflow the mobile viewport with no horizontal scroll wrapper; the Role tags clip and the **Status and Actions columns are entirely off-screen** (`shots/D04`). An admin on a phone cannot see status or act on a row.
- **Why it matters:** Breaks the core admin task on mobile; silently hides functionality.
- **Fix:** Wrap tables in `overflow-x-auto`, or switch to a stacked card layout < `sm`.
- **Suggested command:** `/impeccable adapt`.

### [P2] Icon-only controls have no accessible name; 404 ships a developer message
- **What:** Notifications bell (unnamed at 0 unread), copy-secret (MFA setup), document download/delete, copy-password (users), template-builder move/remove-stage buttons — all icon-only without `aria-label`. Separately, the 404 page reads **"Did you forget to add the page to the router?"** (`shots/A23`) — leaked dev copy, no "Go home" action, not localized.
- **Why it matters:** Screen-reader users get unlabeled buttons; the 404 erodes trust and gives no recovery path.
- **Fix:** Add `aria-label`s; rewrite 404 as user-facing ("This page doesn't exist") + a primary "Go to dashboard/my projects" link; localize.
- **Suggested commands:** `/impeccable clarify` (404 + names), `/impeccable onboard` (empty/error states).

---

## Persona Red Flags

**"Aisha", the Investor (project-specific — primary persona):** Logs in to check her plant. Lands on `/my-projects` → header controls stacked over the page title, cards usable but the page reads broken; opens a project → the pipeline timeline overlaps itself; on mobile it's worse (`shots/D02`). The one person the portal exists for gets its worst-rendered screens.

**Sam (accessibility):** No visible focus ring anywhere; pinch-zoom disabled; multiple unlabeled icon buttons; duplicate/nested `<main>`, `<header>` inside `<main>`, and zero `<nav>` landmarks (confirmed live) break screen-reader structure. Multiple blockers.

**Casey (distracted mobile):** Investor header breaks on mobile; admin tables clip Status/Actions; 24px icon targets are below the 44px minimum. Thumb-zone is fine on dashboard but the primary investor flow is degraded.

**Riley (stress tester):** Finds the header bug instantly; `0% % baseline` double-percent and `assigned to 4 project` (missing plural) in the template builder; dev 404 copy; register-tab and DGA-button interactions behave inconsistently with shadcn ones.

---

## Minor Observations

- Role-tag colour semantics inconsistent (Investor amber-outline vs Top-Management/PM blue vs Admin neutral) — pick one system.
- KPI cards on mobile are very tall for a single number (`shots/D03`) — a lot of whitespace per metric.
- Light-theme inactive tab label ≈ 4.33:1 (fails AA); darken inactive tab text.
- `ThemeToggle` `aria-label`/`title` hardcoded Arabic regardless of active language.
- Page roots animate `animate-in fade-in duration-500` with no `prefers-reduced-motion` gate (only buttons/login honor it).
- Em-dashes in UI copy violate the project's own no-em-dash rule.
- Stage names render in English even in Arabic mode (data not localized) — acceptable, but worth a decision.

---

## Questions to Consider

- The staff UI is excellent and the investor UI is broken by one component. Is shipping the investor portal in this state acceptable, or is the progress-bar reset leak the single highest-leverage fix before anything else?
- Should `DgaLinearProgressBar` be replaced with a token-styled native progress element to permanently remove the runtime reset-injection risk (it's the third reset-bleed casualty after border/padding and anchor/button)?
- What does a confident 404 / empty state look like for an investor who mistypes a URL — and who is accountable for that copy being developer-facing today?

# /impeccable audit — JABEEN Investor Portal (runtime technical audit)

Target: running app on `:5173`, branch `elastic-lederberg-16ee00`. A code-level + runtime technical audit (a11y, performance, theming, responsive, anti-patterns). Evidence: 64 live screenshots in [`shots/`](shots/). Complements the static `web-guidelines-audit.md` already in this folder; findings confirmed/upgraded at runtime are marked **[runtime]**.

---

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | No visible focus indicator app-wide; pinch-zoom disabled; unlabeled icon buttons; duplicate/nested `<main>`, no `<nav>` landmark. |
| 2 | Performance | 3 | Reasonable; IBM Plex Arabic double-loaded (`@import` + `<link>`), tables unvirtualized, no LCP priority on hero. |
| 3 | Responsive Design | 2 | Investor/project header breaks at all widths; admin tables clip Status/Actions on mobile; 24px touch targets. |
| 4 | Theming | 3 | Strong OKLCH/shadcn token system + working dark mode + RTL; undermined by an **unlayered runtime reset** that the layer plugin can't catch. |
| 5 | Anti-Patterns | 3 | No real AI slop; minor copy issues (em-dashes, double-percent). Detector hits largely false positives. |
| **Total** | | **13/20** | **Acceptable** — would be Good (16–17) without the P0 reset-bleed and the focus/zoom a11y failures. |

---

## Anti-Patterns Verdict

**Pass — does not look AI-generated.** Distinctive DGA/JABEEN identity, real RTL, committed dark mode. `detect.mjs` returned no meaningful slop: `border-b-2` flags are the intentional gold tab underline; the em-dash/numbered-marker counts resolve to `index.css` internals, not rendered copy. Only genuine copy nit: em-dashes in live UI strings.

---

## Executive Summary

- **Audit Health Score: 13/20 (Acceptable).**
- Issue counts: **P0 ×1, P1 ×3, P2 ×7, P3 ×6.**
- Top issues:
  1. **[P0]** Unlayered Stencil reset (via `DgaLinearProgressBar`) collapses the app header to `display:block` and zeroes content spacing on every investor-facing page + the template builder.
  2. **[P1]** No visible `:focus-visible` indicator anywhere (WCAG 2.4.7).
  3. **[P1]** `maximum-scale=1` disables pinch-zoom (WCAG 1.4.4).
  4. **[P2]** Admin tables clip Status/Actions on mobile (no horizontal scroll).
  5. **[P2]** Landmark structure broken: nested/duplicate `<main>`, `<header>` inside `<main>`, zero `<nav>`.
- Next steps: fix the reset bleed (P0) and the two a11y P1s first — they are app-wide, deterministic, and compliance-relevant.

---

## Detailed Findings by Severity

### P0
**[P0] Unlayered global CSS reset injected at runtime → header layout collapse + content overlap**
- **Location:** Trigger `DgaLinearProgressBar` (`platformscode-new-react` / `@platformscode/core@0.0.50`, light-DOM Stencil), used in `src/pages/investor/my-projects.tsx`, `src/pages/projects/project-workspace.tsx` (workspace header), and the template builder. App shell header `src/components/layout/header.tsx` (`flex h-16`).
- **Category:** Theming / CSS-architecture / Responsive.
- **Impact:** Header controls stack and overflow onto page content; pipeline timeline / messages / notes collapse to overlapping rows. Affects `/my-projects`, `/projects/:id` (all tabs), `/templates/:id` — every investor screen and the builder.
- **Standard:** N/A (functional/visual defect). 
- **Evidence:** `shots/A02, A03, T04–T06, T13, A10, D02, C02, B02, B08`. Computed `display:block` despite `.flex`; CSSOM shows an unlayered Meyer reset (`<style>` with no `data-vite-dev-id`, not wrapped in `@layer dga`) present **only** on progress-bar pages. Verified in headless **and** real Chrome. Clean control pages: `shots/A16, A17, A20, A21, A07` (header correct `flex`).
- **Recommendation:** Re-assert the shell's layout with unlayered higher-specificity rules in `jabeen-dga-brand.css` (the established fix for this bleed family), **or** prevent `DgaLinearProgressBar` from injecting the global reset (replace with a token-styled native `<progress>`/div, or strip its runtime `<style>`), **or** force the runtime-injected sheet into `@layer dga`.
- **Suggested command:** `/impeccable adapt`.

### P1
**[P1] No visible focus indicator (WCAG 2.4.7)** — `src/index.css` / DGA reset, app-wide. `:focus-visible` matches but renders `outline:0` + transparent ring (unlayered reset beats layered `focus-visible:ring`). Confirmed live on links, selects, toggles, notifications. Fix: unlayered/`!` focus ring. → `/impeccable adapt`.

**[P1] Pinch-zoom disabled (WCAG 1.4.4)** — `index.html` viewport `maximum-scale=1`. Confirmed in served HTML. Fix: remove it. → `/impeccable adapt`.

**[P1] Broken landmark structure** **[runtime]** — `app-layout.tsx` + `ui/sidebar.tsx`: **two `<main>` (one nested in the other)**, `<header>` resolves **inside** `<main>`, and **zero `<nav>`** landmarks (sidebar links in no nav). Confirmed in live DOM. Breaks screen-reader navigation. Fix: one `<main>`, hoist `<header>` out, wrap nav in `<nav aria-label>`. → `/impeccable adapt`.

### P2
- **[P2] Tables clip on mobile** **[runtime]** — Users/dashboard tables overflow 390px with no `overflow-x`; Status + Actions off-screen (`shots/D04`). Wrap in `overflow-x-auto` or stack < `sm`. → `/impeccable adapt`.
- **[P2] Icon-only buttons unnamed** — notifications bell (0-unread), copy-secret (`mfa-setup`), doc download/delete (`documents-tab`), copy-password (`users`), move/remove-stage (`template-builder`). Add `aria-label`. → `/impeccable clarify`.
- **[P2] 404 ships developer copy** — `not-found.tsx`: "Did you forget to add the page to the router?" (`shots/A23`); no recovery link; not localized. Rewrite user-facing + "Go home". → `/impeccable clarify`.
- **[P2] Login inputs lack types/autocomplete** — email not `type=email`/`autocomplete=email`, password not `current/new-password`, phone not `tel`. → `/impeccable clarify`.
- **[P2] Light-theme inactive tab contrast 4.33:1** **[runtime]** — fails AA; darken `data-[state=inactive]` tab text. → `/impeccable colorize`.
- **[P2] `ThemeToggle` aria-label hardcoded Arabic** regardless of language. Localize via `t()`. → `/impeccable clarify`.
- **[P2] Page-root reveal motion ungated** — `animate-in fade-in duration-500` on page roots without `prefers-reduced-motion`. Add a reduced-motion rule. → `/impeccable animate`.

### P3
- **[P3] Touch targets < 44px** — 24px (`h-6 w-6`) icon buttons in template-builder & table actions. → `/impeccable adapt`.
- **[P3] Font double-load** — IBM Plex Sans Arabic via CSS `@import` *and* `<link>`; drop the `@import`. → `/impeccable optimize`.
- **[P3] Copy bugs** — `0% % baseline` (double %), `assigned to 4 project` (missing plural), em-dashes in UI copy, `authorRole.replace('-',' ')` raw/unlocalized role. → `/impeccable clarify`.
- **[P3] KPI cards over-tall on mobile** — lots of whitespace per metric (`shots/D03`). → `/impeccable layout`.
- **[P3] Unvirtualized lists/tables** — fine at current data volume; revisit at scale. → `/impeccable optimize`.
- **[P3] No LCP priority / preload on login hero image**. → `/impeccable optimize`.

---

## Patterns & Systemic Issues

1. **Unlayered DGA reset bleed is the recurring root cause.** It already forced unlayered fixes for borders, padding, anchor colour, and button colour (documented in `jabeen-dga-brand.css`). `display` (header flex) and `outline` (focus ring) are the next two unpatched casualties — and the progress bar's *runtime* injection is a path the `dgaCssInLayer` Vite plugin structurally cannot intercept. Treat this as one architectural problem, not five spot-fixes.
2. **Quality is bimodal by surface.** Pages without DGA progress bars are polished and accessible-ish; pages with them are broken. The split maps exactly to investor vs staff — the wrong half is broken.
3. **Accessibility is the consistent soft spot** across surfaces: focus, zoom, names, landmarks.

---

## Positive Findings (keep & replicate)

- Cohesive DGA gold design system on all staff surfaces; consistent cards/tables/tags/forms (`shots/A16, A17, A20, A21`).
- Dark mode is complete and legible (`shots/B03`); RTL is excellent and thorough (`shots/C03`).
- Native `<dialog>` modals with focus trap, Esc, `::backdrop`, grouped fields, required markers (`shots/G01, G02`).
- Documented, measured contrast fixes hold up at runtime (own-message gold bubble dark text, white-on-purple/gold button labels).
- No AI-slop tells; distinctive, on-brand identity.
- Locale-aware date/number formatting; logical CSS properties throughout for RTL.

---

## Recommended Actions (priority order)

1. **[P0] `/impeccable adapt`** — kill the unlayered reset bleed: restore `header`/shell `display:flex`, the `:focus-visible` ring, and gate the runtime reset (the highest-leverage fix; repairs every investor screen + the builder at once).
2. **[P1] `/impeccable adapt`** — remove `maximum-scale=1`; fix landmarks (single `<main>`, hoist `<header>`, add `<nav>`); wrap tables in `overflow-x-auto`.
3. **[P2] `/impeccable clarify`** — add `aria-label`s to icon buttons; rewrite + localize the 404; fix copy bugs (`0% %`, plural, em-dashes); set login input types/autocomplete; localize ThemeToggle label.
4. **[P2] `/impeccable colorize`** — darken inactive-tab text to pass AA in light theme; align role-tag colour semantics.
5. **[P3] `/impeccable optimize`** — drop duplicate font load; add LCP priority; revisit virtualization at scale.
6. **`/impeccable polish`** — final pass once the above land.

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `/impeccable audit` after fixes to see your score improve.

# Web Interface Guidelines — UI/UX Audit

**Branch:** `elastic-lederberg-16ee00`
**Scope:** `artifacts/jabeen-portal/` (all UI source — `index.html`, `src/**`)
**Method:** `web-design-guidelines` skill (Vercel Web Interface Guidelines, fetched live) applied against the UI source.
**Date:** 2026-06-27
**Status:** Audit only. No UI code changed; this report is the sole artifact.

Paths below are relative to `artifacts/jabeen-portal/`.

---

## 1. Design system summary

**Stack:** React 19 + Vite 7 + Tailwind CSS v4 + `wouter` (routing) + `@tanstack/react-query`. UI lives in the `jabeen-portal` workspace package. Two component layers: shadcn/ui primitives (`src/components/ui/*`) and DGA "Platforms Code" web components (`platformscode-new-react`) wrapped by `dga-*` adapters.

**Cascade layers** (`src/index.css:4`): `@layer dga, theme, base, components, utilities`. The DGA `core.css` reset is wrapped into the `dga` layer by a Vite plugin so it ranks below Tailwind; several unlayered overrides in `src/styles/jabeen-dga-brand.css` re-assert button/input/anchor styling the reset stripped.

**Tokens / theming** (`src/index.css`, `src/styles/jabeen-dga-brand.css`):
- shadcn HSL tokens (`--background`, `--foreground`, `--primary`, …) mapped to Tailwind via `@theme inline`.
- Brand accent: JABEEN gold `#b38916` (gold-600), overriding the DGA `--colors-primary-sa-flag-*` ramp in both themes.
- Light/dark via `data-theme` on `<html>` (not the `.dark` class); `@custom-variant dark` is wired to `[data-theme="dark"]`. Anti-flash inline script in `index.html` sets theme before paint; **default theme is dark**.
- Documented AA contrast work: gold text darkens to gold-800 in light / gold-500 in dark (`jabeen-dga-brand.css:63-73`); gold primary-button and own-message bubble labels forced dark (`dga-brand-button.tsx`, `messages-tab.tsx:68`).
- Type scale and soft elevation shadows defined in `@theme inline`. Radius base `0.5rem`.

**Light/dark toggle:** `src/components/ThemeToggle.tsx` (+ `useTheme`), persists `jabeen-theme` to localStorage.

**RTL / i18n:** `i18next` + `react-i18next` + browser language detector (`src/i18n/index.ts`), locales `ar` (default) / `en`. `useLanguage` (`src/hooks/use-language.tsx`) syncs `<html dir lang>`; `App.tsx` feeds direction to Radix via `DirectionProvider`. Logical CSS props (`ms-/me-/ps-/pe-/start/end`), `rtl-flip` utility (`index.css:307`), and sidebar side-flip are used throughout. Locale-aware formatters in `src/lib/format.ts` (`Intl.NumberFormat` / `Intl.DateTimeFormat`).

**Observed strengths:** consistent logical properties for RTL; `Intl`-based date/number helpers; native `<dialog>` modal (focus trap + ESC for free) via `dga-modal.tsx`; `Button` honors `prefers-reduced-motion`; documented, measured contrast fixes.

---

## 2. Findings count

| Category | P1 | P2 | P3 | Total |
|---|---|---|---|---|
| Accessibility (WCAG AA) | 0 | 12 | 4 | 16 |
| Semantics | 0 | 3 | 2 | 5 |
| Keyboard & focus | 0 | 4 | 1 | 5 |
| Forms | 0 | 3 | 2 | 5 |
| Responsive | 1 | 0 | 3 | 4 |
| Motion | 0 | 1 | 2 | 3 |
| Performance | 0 | 1 | 4 | 5 |
| RTL / i18n | 0 | 3 | 7 | 10 |
| **Total** | **1** | **27** | **25** | **53** |

Priority key: **P1** broken / fails accessibility · **P2** important · **P3** polish.

---

## 3. Findings

### Accessibility (WCAG AA)

- `src/components/layout/header.tsx:42` — P2 — Notifications icon button has no accessible name; only a conditional `sr-only` count when `unreadCount>0`, so it's unnamed at 0 unread. Fix: add `aria-label`.
- `src/components/ui/dga-text-field.tsx` / `src/components/ui/city-switcher.tsx:11` see Forms/below — see category entries.
- `src/components/city-switcher.tsx:11` — P2 — `SelectTrigger` has no `aria-label`; relies on placeholder/value only. Fix: `aria-label={t("common.cityFilter")}`.
- `src/pages/dashboard/dashboard.tsx:432` — P2 — Search `<Input>` has placeholder but no label/`aria-label`. Fix: add visually-hidden `<label>` or `aria-label`.
- `src/pages/projects/tabs/messages-tab.tsx:83` — P2 — Compose `<Textarea>` has no associated label (placeholder only). Fix: add `aria-label`/`<label>`.
- `src/pages/auth/mfa-setup.tsx:211` — P2 — Copy-secret icon button has no name (`aria-label`/`title`). Fix: add `aria-label`.
- `src/pages/projects/tabs/documents-tab.tsx:94` — P2 — Download `<a download>` wraps an icon-only button with no text/name. Fix: `aria-label` on the anchor/button.
- `src/pages/projects/tabs/documents-tab.tsx:99` — P2 — Delete icon button has no name. Fix: add `aria-label`.
- `src/pages/admin/users.tsx:274` — P2 — Copy-password icon button has no name. Fix: add `aria-label`.
- `src/pages/admin/template-builder.tsx:310` — P2 — Back icon button has no name. Fix: add `aria-label`.
- `src/pages/admin/template-builder.tsx:401` — P2 — Move-stage up/down icon buttons have no name. Fix: add `aria-label` per direction.
- `src/pages/admin/template-builder.tsx:416` — P2 — Remove-stage icon button has no name. Fix: add `aria-label`.
- `src/pages/admin/template-builder.tsx:513` — P2 — Remove-field icon button has no name. Fix: add `aria-label`.
- `src/components/layout/header.tsx:43` — P3 — `Bell` icon not `aria-hidden`. Fix: `aria-hidden="true"`.
- `src/pages/admin/cities.tsx:203,212` · `categories.tsx:199,208` · `users.tsx:369,379,386,389` · `templates.tsx:180,190` — P3 — Icon buttons name themselves via `title` only; `title` is not reliably announced (touch/some AT). Fix: add `aria-label` alongside `title`.
- `src/components/layout/notification-panel.tsx:34-39` — P3 — Per-kind status icons convey meaning but have no text/`aria-label` and aren't `aria-hidden`. Fix: label the row by kind or hide icons.
- `src/components/layout/sidebar-nav.tsx:121,137,144` — P3 — Nav icons not `aria-hidden` (each has adjacent text, so low impact). Fix: `aria-hidden` on the icons.

### Semantics

- `src/components/layout/app-layout.tsx:17` + `src/components/ui/sidebar.tsx:310` — P2 — Nested/duplicate `<main>`: `SidebarInset` renders `<main>`, and `app-layout` nests a second `<main>` inside it. Fix: make the inner wrapper a `<div>`; keep one `main`.
- `src/components/layout/header.tsx:28` — P2 — `<header>` banner is rendered inside the outer `<main>` (`SidebarInset`). Banner must not be inside main. Fix: hoist header out of the `main` landmark.
- `src/components/layout/sidebar-nav.tsx:112-127` — P2 — Primary navigation is not wrapped in a `<nav>` landmark (no `<nav>` emitted by the sidebar menu). Fix: wrap the menu in `<nav aria-label={t("nav.primary")}>`.
- `src/components/layout/notification-panel.tsx:46` — P3 — `<h4>` used with no preceding `h1`–`h3` in the popover subtree (heading-level skip). Fix: use `<h2>`/`<h3>` or a non-heading.
- `src/pages/dashboard/dashboard.tsx:403,414` vs `:429` — P3 — Breakdown `<h3>` headings appear before the table's `<h2>` under the page `<h1>` (out-of-order). Fix: demote/reorder so levels descend.

### Keyboard & focus

- `src/components/layout/app-layout.tsx` — P2 — No skip-to-content link; keyboard users must tab the whole sidebar each navigation. Fix: add a focusable skip link targeting `main`.
- `src/components/layout/notification-panel.tsx:65` — P2 — Notification row is a clickable `<div>` (`onClick`) with no `role`/`tabIndex`/key handler; not keyboard operable. Fix: render as `<button>`.
- `src/pages/projects/tabs/updates-tab.tsx:107` — P2 — Image-zoom wrapper is a clickable `<div>` with no keyboard support. Fix: use `<button>`.
- `src/pages/projects/tabs/updates-tab.tsx:71-75` — P2 — `<img onClick>` (zoom) is not focusable/operable by keyboard. Fix: wrap in a `<button>`.
- `src/components/ThemeToggle.tsx:72` / `src/pages/auth/login.tsx:332` — P3 — Inline-styled controls rely on the UA default outline (no enhanced `:focus-visible` ring consistent with shadcn). Fix: add a `focus-visible` ring.

### Forms

- `src/components/ui/dga-text-field.tsx:31` — P2 — Adapter exposes only `text|number|password`; no `email`/`tel`/`url`, and no `autocomplete`/`inputMode`/`spellCheck` props. All DGA forms inherit this gap. Fix: thread `type`/`autoComplete`/`inputMode` through to the inner input.
- `src/pages/auth/login.tsx:311-325,376-405` — P2 — Email field is not `type="email"` / `autocomplete="email"`; password not `autocomplete="current-password"`/`"new-password"`; phone not `type="tel"`/`autocomplete="tel"`. Fix: set types and autocomplete tokens.
- `src/pages/projects/tabs/updates-tab.tsx:307-310` — P2 — `email` and `telephone` widgets render a generic text `<Input>` (no `type`/`inputMode`). Fix: map widget → `type="email"`/`type="tel"` + `inputMode`.
- `src/pages/projects/tabs/updates-tab.tsx:310,313` — P3 — Inline-edit inputs have no associated `<label>` (placeholder only). Fix: associate the field-name label.
- DGA field error path (`dga-text-field.tsx:60-61` → web component) — P3 — Cannot verify `aria-invalid`/`aria-describedby`/`role=alert`/`aria-live` on error are emitted by the closed DGA web component. Fix: verify in rendered DOM; add live region if absent.

### Responsive

- `index.html:5` — P1 — `<meta name="viewport" … maximum-scale=1>` disables pinch-zoom (fails WCAG 1.4.4 Resize Text). Fix: remove `maximum-scale=1` (and any `user-scalable=no`).
- `src/pages/auth/login.tsx:359,393` — P3 — Register field pairs use `grid-cols-2` with no single-column fallback; cramped below ~360px. Fix: `grid-cols-1 sm:grid-cols-2`.
- `src/pages/dashboard/dashboard.tsx:441` (and admin/users tables) — P3 — Wide `<Table>`s have no horizontal-scroll wrapper; risk of overflow on small screens. Fix: wrap in `overflow-x-auto`.
- `src/pages/admin/template-builder.tsx:401` — P3 — `h-6 w-6` (24px) icon buttons are below the ~44px touch-target minimum. Fix: enlarge hit area on touch.

### Motion

- `src/index.css` (used by `src/pages/**` e.g. `dashboard.tsx:361`, `audit/audit-log.tsx:19`, `admin/*`, `profile/profile.tsx:120`, `investor/my-projects.tsx:21`, `projects/project-workspace.tsx:50`, `settings/settings.tsx:62`) — P2 — Page roots animate with `animate-in fade-in duration-500` with no `prefers-reduced-motion` gate; only `.login-*` and `Button` honor reduced motion. Fix: add a global reduced-motion rule disabling `animate-in`, or `motion-reduce:` variants.
- `src/pages/projects/tabs/updates-tab.tsx:652,759` + `src/components/ui/progress.tsx:21` — P3 — `transition-all` animates `width` (non-compositor; `all` is over-broad). Fix: animate `transform` or restrict to `transition-[width]`.
- `src/pages/**` (`animate-spin`, `animate-pulse` skeletons/loaders) — P3 — Spinners/pulses not gated by reduced motion. Fix: gate via `motion-reduce:`.

### Performance

- `src/styles/jabeen-dga-brand.css:29` — P2 — IBM Plex Sans Arabic is loaded via render-blocking CSS `@import` (serial) and again via `<link>` in `index.html:33` (double load). Fix: drop the `@import`; keep the preconnected `<link>`.
- `src/pages/projects/tabs/updates-tab.tsx:71-75` — P3 — `ProtectedImage` `<img>` has no `width`/`height` (only container `aspect-video`) and no `loading="lazy"`; potential CLS. Fix: set intrinsic dimensions + lazy-load below-fold.
- `src/pages/dashboard/dashboard.tsx:441` · `admin/users.tsx` · `messages-tab.tsx` · `updates-tab.tsx` · `audit/audit-log.tsx` — P3 — Long lists/tables render unvirtualized (>50 rows possible). Fix: virtualize large lists.
- `src/pages/auth/login.tsx:176-184` — P3 — Above-fold hero image has dimensions but no `fetchpriority="high"`/preload. Fix: prioritize the LCP image.
- `index.html:30-33` — P3 — Critical fonts are not preloaded (only preconnect + `display=swap`). Fix: `<link rel="preload">` the primary font.

### RTL / i18n

- `src/components/layout/notification-panel.tsx:87` — P2 — `formatDistanceToNow` (date-fns) called without a locale → English relative time even in Arabic. Fix: pass the active `date-fns` locale.
- `src/components/ThemeToggle.tsx:75,77` — P2 — `aria-label`/`title` are hardcoded Arabic regardless of active language. Fix: localize via `t(...)`.
- `src/pages/projects/tabs/updates-tab.tsx:310,313,337` — P2 — Placeholders hardcoded English (`` `Enter ${name}...` ``, `"Select..."`) and use literal `...` not `…`. Fix: localize + use `…`.
- `src/pages/projects/tabs/updates-tab.tsx:871` — P3 — Lightbox `alt="Full size"` hardcoded English. Fix: localize.
- `src/pages/auth/mfa-setup.tsx:205` — P3 — `alt="MFA QR Code"` hardcoded English. Fix: localize.
- `src/pages/projects/tabs/messages-tab.tsx:62` — P3 — `msg.authorRole.replace('-', ' ')` renders a raw, partially-formatted role; not localized. Fix: use `t(`roles.${role}`)`.
- `src/pages/dashboard/dashboard.tsx:392,407,418` — P3 — KPI/breakdown counts rendered raw (not `fmtNumber`) → no locale digit grouping. Fix: format with `fmtNumber`.
- `src/components/ui/chart.tsx:243` · `src/components/ui/calendar.tsx:40,193` — P3 — `toLocaleString`/`toLocaleDateString` with default locale (shadcn primitives). Fix: pass the active locale if these are used.
- `index.html:2` — P3 — `<html lang="ar" dir="rtl">` hardcoded; correct only until `useLanguage` runs, so a persisted `en` session flashes RTL on first paint. Fix: set `dir`/`lang` in the anti-flash script from stored lang.
- `index.html:3-9` — P3 — No `<meta name="theme-color">` and no `color-scheme` declaration for the dark default. Fix: add `color-scheme` + theme-aware `theme-color`.

---

## 4. Notes

- shadcn/ui primitives in `src/components/ui/*` largely follow the guidelines (paired `focus-visible` rings after `outline-none`, logical properties, `role="alert"` in `field.tsx`/`alert.tsx`). Findings above target app-level usage and the custom DGA adapters.
- Several DGA components are closed web components (`platformscode-new-react`); error-state ARIA and internal focus styling could not be verified from source and are flagged for runtime verification.
- Counts treat each unique issue once under its primary category; some findings have secondary effects in another category (noted inline).

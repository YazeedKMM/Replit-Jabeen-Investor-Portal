# /impeccable adapt — changes applied

Applied to branch `elastic-lederberg-16ee00`, verified live against the running app (headless + real Chrome, light/dark/RTL/mobile). **Not committed** — left in the working tree for review. Before/after screenshots: [`shots/`](shots/) (before) vs [`shots-after/`](shots-after/) (after).

## Changes

| # | Issue (severity) | Fix | Files |
|---|---|---|---|
| 1 | **Reset-bleed: header collapses + content overlaps on all progress-bar pages (P0)** | New runtime guard wraps the DGA Stencil runtime-injected unlayered Meyer reset into `@layer dga` (the runtime analog of the `dgaCssInLayer` Vite plugin, which only catches build-time imports). The reset now ranks below Tailwind, so the header's `flex` and element spacing are restored everywhere. | `src/lib/dga-layer-guard.ts` (new), `src/main.tsx` |
| 2 | **Pinch-zoom disabled (P1, WCAG 1.4.4)** | Removed `maximum-scale=1` from the viewport meta; added `viewport-fit=cover`. | `index.html` |
| 3 | **No visible focus indicator (P1, WCAG 2.4.7)** | Added an unlayered `:focus-visible` gold outline that wins over the (now demoted) reset. | `src/styles/jabeen-dga-brand.css` |
| 4 | **Broken landmarks (P1)** | `SidebarInset` now renders a `<div>` instead of a second `<main>`, so there is one `<main>` and the `<header>` sits outside it; the sidebar menu is wrapped in `<nav aria-label="Primary">`. | `src/components/ui/sidebar.tsx`, `src/components/layout/sidebar-nav.tsx` |

## Verification (runtime, post-fix)

- Header `display` on `/my-projects` and `/projects/:id`: `block` → **`flex`** (matches admin pages). Reset stylesheet now `wrapped-in-layer-dga`.
- Pipeline timeline / messages / cards: spacing restored, no overlap (see `shots-after/V01–V07`), across light, dark, mobile (390px), and Arabic RTL.
- Landmarks: `main` count `2 → 1`; `nav` count `0 → 1` (`aria-label="Primary"`); header no longer inside `main`.
- Keyboard focus: Tab now shows a 2px solid gold outline (`focus-visible` confirmed).
- Viewport meta no longer contains `maximum-scale`.
- **Zero console errors/warnings** after the change; clean admin pages unaffected (no regression).

## Notes

- The existing unlayered re-asserts in `jabeen-dga-brand.css` (§4c input border/padding, §4d `button.text-white`) remain — they're now redundant with the guard but harmless, and kept as defense-in-depth. They can be removed in a later cleanup once the guard is trusted.
- Typecheck has **pre-existing** errors unrelated to these changes (`updates-tab.tsx` implicit-`any`s; `settings.tsx` `TS6305` — libs must be built first via `pnpm run typecheck:libs`). No changed file in this set introduces a type error.

## Follow-up commands applied (committed after adapt)

All verified live (light/dark/RTL where relevant), each its own commit:

- **`/impeccable clarify`** (`34c740e`): 404 now shows a user message + "Back to home" link (was the developer-facing "Did you forget to add the page to the router?") and uses theme tokens; localized ThemeToggle labels (were hardcoded Arabic); accessible names on icon-only controls (notifications bell, document download/delete, copy temp password, copy MFA secret, template-builder back / move-up / remove-stage / remove-field); copy fixes in the template builder ("0% % baseline" → "0% baseline", "N project(s)" plural, em-dash → semicolon); matching en/ar i18n keys.
- **`/impeccable colorize`** (`6df9617`): inactive Tabs text `muted-foreground` (4.33:1, fails AA light) → `text-foreground/70` (~6:1); role tags no longer borrow a severity colour — investor = neutral, all staff = info.
- **`/impeccable animate`** (`659be61`): decorative `animate-in` page-reveal entrances made instant under `prefers-reduced-motion: reduce` (content stays visible); essential loading spinners/skeletons left running. Verified `animation-duration 0.001s`, `opacity 1` under emulated reduce.
- **`/impeccable optimize`** (`216e5df`): removed the duplicate render-blocking `@import` of IBM Plex Sans Arabic (kept the preconnected `<link>` — one css2 request now); `fetchPriority="high"` on the LCP login hero image.

Post-fix verification screenshots: [`shots-after/`](shots-after/) (`V08` 404, `V09` template-builder, `V10` users role tags/tabs).

## Scoped follow-ups (done, `25328d3`)

- **44px touch targets**: a `@media (pointer: coarse)` rule enforces a 44×44 minimum hit area on interactive controls (WCAG 2.5.8). Scoped to touch so mouse/desktop density is unchanged; icon-only controls (single svg child) also get min-width. Verified: under coarse emulation all 21 icon buttons ≥44px; desktop unchanged (36px).
- **aria-labels on admin table actions**: added `aria-label` alongside the existing `title` on cities/categories edit+delete, templates archive+delete, and the users row actions (manage-cities / reset-MFA / reset-password / activate-deactivate); icons marked `aria-hidden`. Verified live (e.g. "Edit City" / "Delete City").

## Not a defect

- The data-table "clipping" finding was re-checked and is actually horizontal scroll via shadcn's `overflow-auto` wrapper — acceptable.

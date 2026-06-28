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

## Not done in this pass (separate commands)

These audit findings are out of `adapt`'s scope — recommended follow-ups: icon-button `aria-label`s + the developer-facing 404 copy + copy bugs (`0% %`, "4 project", em-dashes) → `/impeccable clarify`; light-theme inactive-tab contrast + role-tag colour semantics → `/impeccable colorize`; ungated reveal motion → `/impeccable animate`; duplicate font load → `/impeccable optimize`; per-component 44px touch targets → scoped `adapt`. (The data-table "clipping" was re-checked and is actually horizontal scroll via shadcn's `overflow-auto` wrapper — acceptable, not a defect.)

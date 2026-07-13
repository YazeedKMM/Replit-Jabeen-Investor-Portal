# Motion Registry — JABEEN Portal

Phase E deliverable (spec §Phase E). Companion to `docs/rtl.md`: that file governs
*layout* direction, this one governs *motion* — what animates, which direction it
moves, and how it degrades under reduced-motion. Sweep baseline: 2026-07-12, zero
unmanaged or unguarded animations in `artifacts/jabeen-portal/src`.

## How motion works here

Two rules, both enforced in `src/index.css`:

1. **Everything respects `prefers-reduced-motion`.** There is exactly **one**
   `@media (prefers-reduced-motion: reduce)` block in `index.css` (search it — a
   second block is a bug). Every custom animation utility is neutralised there, and
   each resolves to a valid resting state (final opacity/transform), so no content is
   ever left invisible when motion is off. Essential *loading* feedback
   (`animate-spin` spinners, shimmer/pulse skeletons) is intentionally left running —
   it communicates state, not decoration.
2. **Directional motion follows the active `dir`.** Motion that travels along the
   inline axis (a shimmer sweep, a drawer slide) must move with the reading direction.
   Motion that is vertical or symmetric (a fade+rise, a horizontal shake centred on
   zero) is direction-neutral and needs no per-direction handling — but the utility's
   comment says so explicitly. `dir`/`lang` are set on `<html>` by
   `src/hooks/use-language.tsx`; Radix components receive direction via
   `DirectionProvider` (see `docs/rtl.md`).

## Motion inventory

All utilities are defined in `src/index.css`. "Direction" is one of: **neutral**
(vertical/symmetric, identical both ways), **dir-aware** (an explicit `[dir=rtl]`
rule flips it), or **Radix-resolved** (the physical direction is computed after Radix
resolves `dir`, so it is already correct — see `docs/rtl.md`).

### Phase E utilities

| Utility | Defined | Consumed by | Direction | Reduced-motion fallback |
|---|---|---|---|---|
| `.skeleton-shimmer` | `index.css` (`@keyframes skeleton-shimmer` + rule) | `components/ui/skeleton.tsx` → every skeleton (dashboard `DashboardSkeleton`, investor `PageSkeleton`/`RailSkeleton`) | **dir-aware** — sweep runs L→R, reversed by `[dir="rtl"] .skeleton-shimmer { animation-direction: reverse }` so it tracks reading direction | `animation: none` → static `bg-primary/10` placeholder block |
| `.enter-rise` | `index.css` (`@keyframes enter-rise` + rule) | investor empty + list-error `<section>`s (`pages/investor/my-projects.tsx`); shared `FieldError` (`pages/auth/login.tsx`) | **neutral** — opacity + `translateY(4px)→0` (vertical) | `animation: none` → element at natural opacity 1, in place |
| `.attention-nudge` | `index.css` (`@keyframes attention-nudge` + rule) | login + register error `<Alert>`s (`pages/auth/login.tsx`) | **neutral** — symmetric `translateX(±3px)` shake, centred on 0 | `animation: none` → alert appears in place (still `role="alert"`-announced) |
| `.stagger-rise` | `index.css` (`.stagger-rise > *` + nth-child delays) | `DashboardSkeleton` wrapper (`pages/dashboard/dashboard.tsx`) — cascades its 3 direct children | **neutral** — children use `.enter-rise` (vertical) with 60/120/180ms delays | `animation: none` on `.stagger-rise > *` → all children show at once, in place |

Shared eases/durations (Phase E): `--ease-standard`, `--dur-fast` (150ms),
`--dur-base` (260ms), plus the pre-existing `--ease-out-strong`. Only
`transform`/`opacity`/`background-position` animate.

### Pre-existing (Phase D) motion

| Utility / pattern | Defined | Consumed by | Direction | Reduced-motion fallback |
|---|---|---|---|---|
| `.login-rise` | `index.css` (`@keyframes login-rise`) | login surface entrance | **neutral** — opacity + `translateY` | swapped to `login-fade` (opacity-only), 220ms |
| `.login-press` | `index.css` | login submit press feedback | **neutral** — `transform: scale` on `:active` | `transition: none`; `:active` transform removed |
| `.animate-in fade-in` (tailwindcss-animate) | `tw-animate-css` import; `.animate-in` reduce override in `index.css` | page-root entrance reveals: `pages/audit/audit-log.tsx`, `pages/profile/profile.tsx`, `pages/projects/project-workspace.tsx` | **neutral** — opacity fade | `.animate-in { animation-duration: 1ms; animation-delay: 0 }` → content shows instantly |
| Global `Button` press/focus | `components/ui/button.tsx` | every `Button` app-wide | **neutral** — `active:scale-[0.97]` + `focus-visible:ring-2` | `motion-reduce:transition-none` + `motion-reduce:active:scale-100` (built into the variant) |
| `animate-spin` (Loader2) | Tailwind/tw-animate | `protected-route.tsx`, `pages/admin/branding.tsx`, `pages/audit/audit-log.tsx`, `pages/dashboard/dashboard.tsx` | **neutral** — rotation | **intentionally left running** — essential loading feedback, not decoration |
| `transition-colors duration-150 hover:*` | inline utilities | interactive links/rows: dashboard rows + name links, investor project links, mfa-setup/mfa-verify back links, profile, template-builder, notification-panel, ThemeToggle | **neutral** — colour interpolation only (no positional motion) | colour transitions are non-vestibular; the movement-bearing components (Button, links in `my-projects.tsx`) additionally carry `motion-reduce:transition-none` |

### Radix `data-[side=…]` physical animations

The `components/ui/*` primitives (tooltip, popover, dropdown-menu, select, dialog,
sheet, toast, …) use physical `data-[side=left]:slide-in-from-right-2`-style
animations and physical `side`/swipe transforms. These are **Radix-resolved**: Radix
computes `side`/`align` *after* resolving direction, so the data attribute is already
direction-correct and the keyed animation must stay physical. This is documented in
full in `docs/rtl.md` ("Intentional physical CSS"). Do not convert them to logical.

## Phase E audit results (2026-07-12)

- **emil micro-interaction pass:** audited the interactive affordances (dashboard
  table rows + name links, investor project links, auth back-links, template-builder
  rows, notification-panel rows, ThemeToggle) and the global `Button`. All already
  carry appropriate `transition-colors`/hover/press/focus treatment from Phase D.
  **Zero component files changed** — the correct outcome when the base is already
  covered; adding redundant classes would be churn.
- **Directional + reduced-motion sweep:** every animation hit in
  `artifacts/jabeen-portal/src` resolves to one of: neutral, dir-aware, or
  Radix-resolved (per the tables above); every custom utility is neutralised in the
  single reduce block. No raw physical directional slide (`slide-in-from-left/right`)
  exists in any app *page* — such patterns live only in the Radix `ui/*` primitives
  and are direction-correct there. No unmanaged or unguarded animation found.

Anything animated that is **not** covered by a row above is a gap — add it here with
its direction behavior and reduced-motion fallback, or neutralise it in the reduce
block.

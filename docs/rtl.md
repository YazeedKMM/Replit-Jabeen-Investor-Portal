# RTL Registry — JABEEN Portal

Phase C deliverable (spec §Phase C). Two lists: physical CSS that is *intentionally*
physical, and the icon-mirroring inventory. Sweep baseline: 2026-07-06, zero raw
physical properties in `.css` files, zero unexplained physical utilities in app pages.

## How RTL works here

- `dir` + `lang` are set on `<html>` by `src/hooks/use-language.tsx` (never per-component);
  Radix receives the direction via `DirectionProvider` in `App.tsx`.
- Layout uses logical utilities (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`).
- Directional glyphs mirror via the `.rtl-flip` class (defined in `index.css`:
  `[dir="rtl"] .rtl-flip { transform: scaleX(-1) }`).

## Intentional physical CSS (do not "fix" these)

| Where | Pattern | Why it is correct |
|---|---|---|
| `components/ui/{tooltip,popover,hover-card,dropdown-menu,menubar,context-menu,select,dialog,alert-dialog}.tsx` | `data-[side=left]:slide-in-from-right-2` etc. | Radix computes `side`/`align` *after* resolving direction — the data attribute is already direction-correct, so animations keyed to it must stay physical. |
| `components/ui/{dialog,alert-dialog,carousel,navigation-menu}.tsx`, `pages/projects/tabs/updates-tab.tsx` (md timeline) | `left-1/2 -translate-x-1/2`, `left-0` with `w-full` | Symmetric centering / full-width anchoring — identical result in both directions. |
| `components/ui/sheet.tsx`, `components/ui/sidebar.tsx` | `side="left" / "right"` variants | Physical-by-API: callers choose the side from the active `dir` (see `sidebar-nav.tsx`: `side={dir === "rtl" ? "right" : "left"}`). |
| `components/ui/toast.tsx` | swipe-direction transforms | Swipe gestures are physical by nature (Radix `swipeDirection`). |
| `components/ui/resizable.tsx` | handle positioning | Panel-group axis is physical. |
| `components/ui/scroll-area.tsx` | `border-l-transparent` on the vertical scrollbar | Transparent 1px spacer; Radix places the scrollbar on the correct side per direction. |
| `pages/dashboard/dashboard.tsx`, `pages/reports/reports.tsx` | `dir="ltr"` on the `ChartContainer` wrappers (three on the dashboard, four on reports) | Recharts renders into SVG with physical coordinates; charts are direction-neutral data, so the chart container is pinned LTR. The surrounding panel headings, HTML legends, and layout stay logical and mirror normally. On reports the "YYYY-MM" month axis labels also stay LTR by design. |

Anything physical **not** in this table is a bug — convert it to the logical
equivalent (`start-`/`end-`) or add it here with a reason.

## Icon-mirroring inventory

**Mirrored (`.rtl-flip`)** — glyphs that encode reading direction:

| File | Icon |
|---|---|
| `pages/auth/mfa-verify.tsx:146` | `ArrowLeft` (back to login) |
| `pages/auth/mfa-setup.tsx:366` | `ArrowLeft` (back to sign in, standalone /mfa/setup page) |
| `pages/investor/my-projects.tsx:187` | `ArrowRight` (view project, pipeline-block header) |
| `pages/audit/audit-log.tsx:85,93` | `ChevronLeft`/`ChevronRight` (pagination prev/next) |
| `pages/admin/template-builder.tsx:311` | `ArrowLeft` (back) |

**Mirrored via component mechanism:**
- `components/ui/calendar.tsx` — react-day-picker nav chevrons rotate 180° under
  `rtl:` variants (see the `rdp-button_next/previous` rules in `calendar.tsx:33`).

**Never mirrored** — direction-neutral or brand-fixed:
- Logos / brand marks (`JABEEN` logo, tenant logos from the branding API)
- Numerals and Latin `code`/ID strings (wrapped in `dir="ltr"` where embedded, e.g. the
  OKLCH strings on `/branding`, and the OTP inputs / TOTP secret / recovery codes on the
  auth pages — `pages/auth/mfa-verify.tsx`, `pages/auth/mfa-setup.tsx`)
- Status icons (`CheckCircle2`, `XCircle`, `Clock`), object icons (`Building2`, `MapPin`,
  `Users`, `Settings`, `Palette`, …)
- The stage-journey rail on `pages/investor/my-projects.tsx` (`Check` markers, plain-line
  connectors): a flex row that mirrors as a whole; markers/connectors are symmetric glyphs
- `LogOut` (points out of the container symmetrically; convention is not to flip)

**Phase D cleanup candidates (currently unused shadcn boilerplate — no imports anywhere):**
`breadcrumb`, `pagination`, `carousel`, `menubar`, `context-menu`, `navigation-menu`,
`dropdown-menu` ship `ChevronRight`/`ChevronLeft` without `.rtl-flip`. If any gets adopted
during the Phase D rebuild, add `rtl-flip` (or `rtl:rotate-180`) to its directional glyphs.

## Fixes applied in Phase D

- `components/ui/progress.tsx` — the fill was `translateX`-based (physically left-anchored);
  converted to a width-based fill so the indicator anchors at inline-start and mirrors in RTL.
  First consumer: the construction-progress bar on `pages/investor/my-projects.tsx`.

## Fixes applied in Phase C

- `pages/projects/tabs/updates-tab.tsx:732` — timeline status dot: `left-0` → `start-0`
  (mobile). The dot now aligns with the timeline line (`before:ms-5`) in both directions;
  the `md:` centering stays physical per the table above.

# Investor Portal Redesign — Design

**Date:** 2026-07-05
**Source brief:** `implementation.md` (repo root), amended by brainstorming decisions below.

## Summary

Full UI/UX redesign of the JABEEN investor portal: a new from-scratch visual identity, a white-label theming system, verified RTL support, and a fresh rebuild of all primary pages. The DGA Platforms Code design system (`platformscode-new-react`, `jabeen-dga-brand.css`) is retired entirely.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| DGA design system | Retire entirely; new identity from scratch |
| Branding storage | Database via API (`system_settings` table), not JSON files |
| Tenant model | One brand per deployment; a single active branding config, no tenant routing |
| Page rebuild scope | Rebuild pages fresh to the new IA (not a reskin) |
| Reports | New backend endpoints in `api-server`, not client-side-only aggregation |
| Phase order | Visual identity moved before theming infrastructure (Approach A) |

## Constraints

- Stack stays React 19 + Tailwind 4 + Vite (`artifacts/jabeen-portal`), Express + Drizzle/Postgres (`artifacts/api-server`, `lib/db`), spec-first API (`lib/api-spec/openapi.yaml` → orval-generated client in `lib/api-client-react`).
- All existing functionality is preserved through the rebuild: MFA auth, role-based routing, audit log, project workspace, i18n (ar/en via i18next).
- Roles: Admin and PM manage branding, per the existing role structure.
- Colors are authored and derived in OKLCH.
- Typography: IBM Plex Sans Arabic for Arabic; Latin pair chosen on a contrast axis (serif×sans or geometric×humanist), validated by design-taste-frontend against generic fintech defaults.

## Phase order

A. Visual identity → B. Theming & white-label foundation → C. RTL verification → D. Structure & build → E. Polish → F. QA.

Each phase has a pass condition; the next phase does not start until it is met.

---

## Phase A — Visual identity

Run impeccable's palette script to generate a brand seed color (from-scratch identity, no tokens preserved). Compose the full palette — bg, surface, ink, accent, muted, plus semantic colors (success, warning, error) — around the seed in OKLCH, in light and dark variants. Pair IBM Plex Sans Arabic with a contrasting Latin face. Check the result with design-taste-frontend against generic SaaS/fintech patterns (navy-and-gold, purple gradient, etc.).

**Deliverable / pass condition:** `DESIGN.md` documenting the palette (OKLCH values), type scale, and light/dark variants. No pages built or modified.

## Phase B — Theming & white-label foundation

### Storage

One row in the existing `system_settings` key/value table, key `branding`, value = JSON blob validated by a Zod schema in `lib/api-zod`:

```ts
{
  name: string,                    // brand display name
  colors: {                        // OKLCH strings
    primary, secondary, accent,
    success, warning, error
  },
  logos: {                         // storage keys into the uploads dir
    light: string, dark: string, favicon: string
  }
}
```

Seeded with the Phase A identity as the default. The same default is compiled into the frontend as a fallback.

**Editable vs. fixed:** only the six brand/semantic colors and the logos are tenant-editable. The neutral scales from DESIGN.md (bg, surface, ink, muted) are part of the fixed identity — derived per light/dark mode, not exposed in the admin editor. Hover/active/disabled shades of the editable colors are derived programmatically from their OKLCH bases, never stored.

### API (spec-first)

Extend `openapi.yaml`, then regenerate the orval client:

- `GET /branding` — public (unauthenticated); the login page must theme before auth.
- `PUT /branding` — Admin/PM only; body validated against the Zod schema.
- `POST /branding/logo` — Admin/PM only; multer diskStorage following the `documents.ts` pattern; validates file type (SVG/PNG/ICO) and size; returns a storage key.
- `GET /branding/logo/{key}` — serves logo files (public).

### Frontend

- **ThemeProvider (React context):** fetches branding on boot; injects CSS custom properties on `:root`; derives shade ramps (hover, active, disabled, subtle surfaces) programmatically from the OKLCH bases; swaps logo per light/dark mode; updates favicon and document title. On fetch failure or invalid payload it falls back to the compiled-in default — the UI can never render unbranded.
- **Admin branding editor:** a settings page (Admin/PM) with color pickers for the six brand colors, logo uploads (light, dark, favicon), a live preview, and save via `PUT /branding`. Rebranding a deployment requires zero code changes.

### DGA teardown

Remove `platformscode-new-react` from `package.json`, delete `jabeen-dga-brand.css`, and remove all DGA token references. UI components are Radix + Tailwind, styled entirely by the new CSS variables. Regenerate `pnpm-lock.yaml` after the dependency removal (Replit frozen-lockfile requirement).

### Docs

A short README section explaining how to rebrand a deployment (admin editor) and how the default theme is seeded.

**Pass condition:** app boots themed from the DB config; changing colors/logo in the admin editor updates the running app; DGA dependency and CSS removed; branding API integration tests green.

## Phase C — RTL verification

RTL infrastructure already exists (`dir` on `<html>` via `use-language.tsx`, `.rtl-flip`, logical `ms-`/`me-` utilities). This phase is an audit:

1. Sweep for remaining physical CSS (`ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`/`text-right`, raw `margin-left` etc.) and convert to logical equivalents. Intentional physical usage (e.g. the login gradient that already switches on `dir`) gets an explanatory comment.
2. Produce an icon-mirroring inventory: flips (arrows, chevrons, back) vs. fixed (logos, numerals, brand marks), standardized on `.rtl-flip`.
3. Verify on real pages (login, a form, a data table) in both `dir="rtl"` and `dir="ltr"`: layout, alignment, icon direction.

**Pass condition:** zero unexplained physical properties in `src/`; inventory documented; both-direction render check passes on the three page types.

## Phase D — Structure & build

### Planning

`impeccable init` (PRODUCT.md, app/dashboard register) if missing, then `impeccable shape` for the IA across: auth/login, dashboard, investor pipeline (six lifecycle stages, backed by the existing stage-template/pipeline API), reports, settings, admin panel.

### Reports backend (built first within this phase)

New endpoints in `openapi.yaml` + `api-server` + `lib/api-zod`, consumed via regenerated orval hooks. Candidate reports (final list decided during shape): project counts by stage/city/category, pipeline stage conversion, activity over time. Role-gated like existing manager endpoints.

### Page rebuild

`impeccable craft`, one page at a time, replacing old page files in place, in this order:

1. auth/login
2. dashboard
3. investor pipeline
4. reports
5. settings
6. admin panel

Each rebuilt page re-wires to the existing API via the generated client and reuses existing i18n keys (new keys added to both `ar.json` and `en.json`).

**Per-page gates (all four must pass before the next page starts):**
1. Colors and logo come from ThemeProvider — no hardcoded brand colors.
2. Logical CSS properties only.
3. Follows the DESIGN.md palette and type scale.
4. Renders correctly in both RTL and LTR (verified in the preview server).

## Phase E — Polish

- emil-design-eng guidance for micro-interactions and animation decisions; `impeccable animate` for page transitions and loading states; `impeccable harden` for error, empty, and edge states.
- Focus areas, each verified in **both** Arabic and English: form validation messages, empty investor-pipeline state, failed login state, dashboard loading skeletons.
- Animations respect `prefers-reduced-motion`; directional motion (slide-ins, drawer origins) follows the active `dir`.

**Pass condition:** all four focus areas exercised in both languages in the preview with correct rendering.

## Phase F — QA

- `impeccable audit` on every rebuilt page: WCAG AA, performance, responsive (mobile/tablet/desktop) and dark mode.
- Second compliance pass with web-design-guidelines.
- Combined white-label × RTL test (single-brand adaptation): change branding via the admin editor while in Arabic/RTL and confirm colors, logos, and layout update together — including the pre-auth login page and favicon.
- Deliverable: QA report of WCAG failures, RTL breaks, and stale-theme spots; all fixed before the phase closes.

**Pass condition:** QA report clean (or all findings fixed and re-verified).

---

## Error handling

- Server: Zod validation rejects malformed branding configs and bad logo uploads (type/size) with 4xx responses; `PUT`/`POST` branding routes are role-gated to Admin/PM.
- Client: ThemeProvider falls back to the compiled-in default theme on fetch failure or schema-invalid payload; logo load failures fall back to the brand name as text.

## Testing

- Branding API integration tests in the existing suite: public GET, role-gated PUT (403 for investor role), upload validation, round-trip (PUT then GET returns the saved config).
- Reports endpoints get integration tests alongside their implementation.
- Every phase ends with the existing integration suite green plus a visual check in the preview server.

## Out of scope

- Multi-tenant routing (hostname mapping, tenants table) — the model is one brand per deployment.
- Any change to auth, MFA, or role semantics.
- New product features beyond the reports endpoints.

# JABEEN — Visual Identity (Phase A)

Single source of truth for the redesigned JABEEN investor portal identity. Later phases copy the
light-palette `primary` / `secondary` / `accent` / `success` / `warning` / `error` values verbatim
into `DEFAULT_BRANDING`, and the full palette into the CSS token layer. Every value is a complete
`oklch(L C H)` string with L in 0–1. All values are inside the sRGB gamut.

**Identity rationale.** Seed: `oklch(0.650 0.100 110.0)` (impeccable brand seed, seed-117 —
olive / yellow-green). Mood: *industrial oasis* — an investor and an RCJY project officer reviewing
licensing stages in a bright Jubail office; daylight, procedural, engineered calm. The seed's olive
hue is deepened into a **palm-olive green** primary (national-green territory without flag-green
cliché), paired with a **gulf-water teal** secondary (Jubail and Yanbu are coastal industrial
cities) and a **burnt-clay** accent (desert mineral, kiln brick). Surfaces stay pure white in light
mode — the mood lives in the brand colors and typography, not in a tinted background. Color
strategy: **restrained** (neutral surfaces, brand color used deliberately on actions, navigation,
and status). This identity is deliberately distinct from the retired gold-on-charcoal DGA look
(gold hue ~85 / warm charcoal hue ~30 — neither appears here) and from generic fintech
(no navy, no gold brand color, no purple gradients).

The dark palette is a designed variant, not an inversion: the ground shifts to a green-cast
near-black, primary flips to a pale pistachio fill carrying dark text (high-salience actions on a
dark ground), while the accent stays a deep ember clay carrying white text — chroma and lightness
are re-tuned per role.

## Palette — light

| Token | OKLCH value | Usage |
|---|---|---|
| bg | oklch(1 0 0) | Page background (pure white) |
| surface | oklch(0.972 0.007 120) | Cards, panels, table headers, inputs, popovers/menus, sidebar surface |
| muted-surface | oklch(0.955 0.008 120) | Subdued surface: table stripes, skeleton loaders, disabled fills — a touch more tint than `surface`, still near-`bg` |
| ink | oklch(0.24 0.02 135) | Body and heading text (green-cast near-black) |
| muted | oklch(0.46 0.025 135) | Secondary text, captions, placeholders |
| primary | oklch(0.46 0.09 118) | Palm olive — primary buttons, active nav, key indicators |
| primary-foreground | oklch(1 0 0) | Text/icons on primary fills |
| secondary | oklch(0.40 0.06 195) | Gulf teal — links, secondary actions, informational chips |
| secondary-foreground | oklch(1 0 0) | Text/icons on secondary fills |
| accent | oklch(0.34 0.09 45) | Burnt clay — badges, selected states, emphasis rules |
| accent-foreground | oklch(1 0 0) | Text/icons on accent fills |
| success | oklch(0.53 0.12 155) | Positive status (approved, completed) |
| warning | oklch(0.56 0.11 75) | Caution status (pending, attention); pair with ink text on tinted fills |
| error | oklch(0.53 0.19 27) | Destructive actions, validation errors |
| border | oklch(0.90 0.012 130) | Hairlines, card borders, dividers |
| ring | oklch(0.52 0.10 118) | Focus rings (primary-hued, visible on white) |

## Palette — dark

| Token | OKLCH value | Usage |
|---|---|---|
| bg | oklch(0.165 0.012 140) | Page background (green-cast near-black, not warm charcoal) |
| surface | oklch(0.215 0.014 140) | Cards, panels, table headers, inputs, popovers/menus, sidebar surface |
| muted-surface | oklch(0.19 0.013 140) | Subdued surface: table stripes, skeleton loaders, disabled fills — slightly lighter than `bg`, darker than `surface` |
| ink | oklch(0.93 0.012 120) | Body and heading text (off-white, never pure white) |
| muted | oklch(0.71 0.02 125) | Secondary text, captions, placeholders |
| primary | oklch(0.83 0.11 120) | Pale pistachio — primary buttons, active nav |
| primary-foreground | oklch(0.20 0.03 135) | Dark text/icons on the pale primary fill |
| secondary | oklch(0.78 0.07 195) | Pale gulf teal — links, secondary actions |
| secondary-foreground | oklch(0.18 0.03 200) | Dark text/icons on the pale secondary fill |
| accent | oklch(0.50 0.12 45) | Ember clay — badges, selected states, emphasis |
| accent-foreground | oklch(1 0 0) | White text/icons on the deep accent fill |
| success | oklch(0.72 0.13 155) | Positive status |
| warning | oklch(0.80 0.13 80) | Caution status; pair with dark-mode `bg` (oklch(0.165 0.012 140)) text on tinted fills |
| error | oklch(0.68 0.17 25) | Destructive actions, validation errors |
| border | oklch(0.30 0.015 140) | Hairlines, card borders, dividers |
| ring | oklch(0.78 0.10 120) | Focus rings (visible on the dark ground) |

**Success/warning foreground policy.** Unlike `primary`/`secondary`/`accent`, `success` and
`warning` do not get dedicated `-foreground` tokens. Both are used as **tinted fills** (a
low-opacity or lightened background) with the mode's body-text color laid over them, never as a
solid fill requiring a contrast-matched foreground:

- Light mode: `success`/`warning` tinted fills pair with `ink` (oklch(0.24 0.02 135)).
- Dark mode: `success`/`warning` tinted fills pair with `bg` (oklch(0.165 0.012 140)) — a dark
  wash of text on the pale tint, matching how `warning`'s tinted-fill note above is now stated
  explicitly instead of the vague "dark text."

**Sidebar and chart token policy.** The sidebar consumes the same `surface` / `ink` / `primary` /
`accent` tokens as the rest of the app — there is no separate sidebar sub-palette. The retired
gold-on-charcoal DGA sidebar look (a bespoke charcoal+gold pairing) is fully retired; the sidebar
is just another `surface` panel with `ink` text and `primary`/`accent` for active/selected states.
For data visualization, `chart-1` through `chart-5` map onto the existing semantic tokens in this
order: `chart-1` = `primary`, `chart-2` = `secondary`, `chart-3` = `accent`, `chart-4` = `success`,
`chart-5` = `warning` — no separate chart palette is introduced.

**Derived borders (out of scope here).** Per-component derived borders (e.g. `--primary-border`,
`--accent-border`) are out of scope for this document; where they exist, they are computed as a
lightness-offset from their base token, applied to the OKLCH `L` channel only (`C` and `H` held
constant), consistent with how `border`/`ring` are already derived above.

## Typography

**Families**

| Role | Face | Axis rationale |
|---|---|---|
| Arabic — all text | IBM Plex Sans Arabic | Fixed by spec; humanist-grotesque, excellent Arabic UI coverage |
| Latin — display, headings, data numerals | Sora | Geometric sans; genuine geometric×humanist contrast against Plex. Not Inter, not a neutral grotesque |
| Latin — body and UI text | IBM Plex Sans Arabic (its Latin set) | Keeps mixed-script paragraphs on one metric system; the contrast axis lives in headings and numerals |
| Monospace — IDs, reference numbers, tabular data | IBM Plex Mono | Plex superfamily sibling; aligns with the Arabic body face |

**Weights to load**

- IBM Plex Sans Arabic: 400, 500, 600, 700
- Sora: 500, 600, 700
- IBM Plex Mono: 400, 500

**Fallback stacks (canonical CSS)**

These are the exact `font-family` stacks the CSS token layer must ship — Sora leads for Latin
display/UI (falling through to the Arabic face for any mixed-script glyphs, then system UI, then a
generic sans), and IBM Plex Mono leads for tabular/reference data:

- `--app-font-sans: "Sora", "IBM Plex Sans Arabic", system-ui, sans-serif;`
- `--app-font-mono: "IBM Plex Mono", ui-monospace, monospace;`

**Type scale** — unchanged from the existing rem baseline in
`artifacts/jabeen-portal/src/index.css` `@theme` (sizes/line-heights kept; only the faces and
weights above change):

| Step | Size | Line height | Typical use |
|---|---|---|---|
| text-xs | 0.75rem (12px) | 1.125rem | Badges, table meta |
| text-sm | 0.875rem (14px) | 1.25rem | Secondary UI text, table cells |
| text-base | 1rem (16px) | 1.5rem | Body text |
| text-lg | 1.125rem (18px) | 1.75rem | Card titles |
| text-xl | 1.25rem (20px) | 1.875rem | Section headings |
| text-2xl | 1.5rem (24px) | 2rem | Page headings (Sora 600 in Latin) |
| text-3xl | 1.875rem (30px) | 2.375rem | Dashboard hero numbers (Sora 600/700) |
| text-4xl | 2.25rem (36px) | 2.75rem | Login/display headings (Sora 700) |

Display headings in Latin use Sora with letter-spacing no tighter than -0.02em; Arabic headings use
IBM Plex Sans Arabic 600/700 with default tracking (never negative tracking on Arabic script).

## Contrast

Measured WCAG 2.x contrast ratios, computed from the OKLCH values above via OKLCH → linear sRGB →
relative luminance (throwaway Node script; Ottosson reference conversion). All values in gamut.

**Light mode**

| Pair | Requirement | Measured | Result |
|---|---|---|---|
| ink on bg | ≥ 7:1 | 16.37:1 | Pass |
| ink on surface | ≥ 7:1 | 15.12:1 | Pass |
| muted on surface | ≥ 4.5:1 | 6.51:1 | Pass |
| muted on bg | ≥ 4.5:1 | 7.05:1 | Pass |
| muted on muted-surface | ≥ 4.5:1 | 6.20:1 | Pass |
| primary-foreground on primary | ≥ 4.5:1 | 6.98:1 | Pass |
| secondary-foreground on secondary | ≥ 4.5:1 | 8.94:1 | Pass |
| accent-foreground on accent | ≥ 4.5:1 | 12.16:1 | Pass |
| primary on bg (UI component) | ≥ 3:1 | 6.98:1 | Pass |
| error on bg (text) | ≥ 4.5:1 | 5.82:1 | Pass |
| success on bg (UI component) | ≥ 3:1 | 4.98:1 | Pass |
| warning on bg (UI component) | ≥ 3:1 | 4.74:1 | Pass |
| primary vs accent (distinctness) | ≥ 1.7:1 | 1.74:1 | Pass |

**Dark mode**

| Pair | Requirement | Measured | Result |
|---|---|---|---|
| ink on bg | ≥ 7:1 | 15.69:1 | Pass |
| ink on surface | ≥ 7:1 | 14.24:1 | Pass |
| muted on surface | ≥ 4.5:1 | 6.82:1 | Pass |
| muted on bg | ≥ 4.5:1 | 7.52:1 | Pass |
| muted on muted-surface | ≥ 4.5:1 | 7.20:1 | Pass |
| primary-foreground on primary | ≥ 4.5:1 | 10.91:1 | Pass |
| secondary-foreground on secondary | ≥ 4.5:1 | 9.61:1 | Pass |
| accent-foreground on accent | ≥ 4.5:1 | 6.31:1 | Pass |
| primary on bg (UI component) | ≥ 3:1 | 11.66:1 | Pass |
| error on bg (text) | ≥ 4.5:1 | 6.18:1 | Pass |
| success on bg (UI component) | ≥ 3:1 | 8.19:1 | Pass |
| warning on bg (UI component) | ≥ 3:1 | 10.17:1 | Pass |
| primary vs accent (distinctness) | ≥ 1.7:1 | 3.82:1 | Pass |

Anti-generic verification (design-taste-frontend): no navy-and-gold, no purple-on-white gradients,
no default Inter, no cream/beige surface attractor; explicitly checked against the outgoing DGA
identity — no gold-family brand color (only the semantic warning amber, which is status vocabulary,
not identity) and no warm-charcoal dark surfaces.

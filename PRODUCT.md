# Product

## Register

product

## Users

Four roles inside one white-label deployment, all task-driven and bilingual (Arabic RTL is a
first-class equal of English LTR):

- **Investor** — an industrial investor (factory owner, plant operator) tracking their own
  projects through the licensing/construction lifecycle. Checks in periodically, often in
  Arabic, wants "where does my project stand and what happens next" in one glance.
- **Project Manager (RCJY officer)** — the day-to-day power user: reviews status updates,
  manages projects, templates, and branding. City-scoped. Lives in tables and review queues.
- **Top Management** — strictly read-only oversight of the whole portfolio; consumes the
  dashboard and reports.
- **Administrator** — full control: users, pipeline templates, cities, categories, settings,
  audit log, branding.

## Product Purpose

The authoritative portal for Royal Commission industrial-city investors (Jubail, Yanbu,
Ras Al-Khair, Jazan) to track construction and operational milestones of their industrial
projects through a staged lifecycle pipeline — and for RCJY staff to manage that portfolio.
Success: an investor knows exactly where each project stands without calling anyone; staff
review updates promptly; management reads portfolio health at a glance.

## Brand Personality

Engineered calm — "industrial oasis" (see DESIGN.md). Three words: **precise, grounded,
unhurried**. Quiet government-grade infrastructure, procedural and trustworthy; never a
consumer fintech app.

## Anti-references

- The retired DGA gold-on-charcoal identity (no gold brand color, no warm-charcoal surfaces).
- Generic SaaS/fintech: navy-and-gold, purple gradients, glassmorphism, hero-metric dashboards.
- Consumer trading/crypto apps: dense tickers, dopamine red/green, decorative motion.

## Design Principles

1. **The pipeline is the product.** Lifecycle stages are the core mental model; every surface
   orients around "which stage, what's next".
2. **Two scripts, one design.** Every layout must be as good in Arabic/RTL as in English/LTR:
   logical properties only, mirrored directional iconography, LTR-pinned numerals and IDs.
3. **White-label by token.** Pages consume ThemeProvider tokens only; the brand is data, not
   code.
4. **Earned familiarity.** Standard affordances (tables, dialogs, forms) executed exceptionally;
   no invented controls.
5. **Status is vocabulary, not decoration.** Semantic colors appear only as status; identity
   colors carry navigation and action.

## Accessibility & Inclusion

WCAG 2.1 AA (contrast ratios measured in DESIGN.md). Full keyboard paths; visible focus via the
ring token. `prefers-reduced-motion` respected on all animation. Bilingual ar/en with `dir`
switching on `<html>`; numerals and Latin ID strings stay LTR inside RTL text.

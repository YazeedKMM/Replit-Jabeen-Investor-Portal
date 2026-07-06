# Redesign Phase C: RTL Verification — Implementation Plan

> **For agentic workers:** small audit phase, executed inline. Steps use checkbox syntax for tracking.

**Goal:** Verify and close out RTL correctness across the frontend per the spec's Phase C (audit, not a build — RTL infrastructure already exists).

**Spec:** `docs/superpowers/specs/2026-07-05-investor-portal-redesign-design.md` (§Phase C)

**Survey findings (2026-07-06):** 28 physical-CSS matches across 17 files in `src/`. All but one are intentional: Radix `data-[side=…]` animation variants (Radix resolves `side` per active direction), symmetric centering (`left-1/2 -translate-x-1/2`, `w-full left-0`), and the sheet/sidebar `side`-prop APIs whose callers already choose the side from `dir` (`sidebar-nav.tsx`). Zero raw physical properties in CSS files. All directional icons in app pages already use `.rtl-flip`; the unflipped chevrons live only in UNUSED shadcn boilerplate (breadcrumb, pagination, carousel, menubar, context-menu, navigation-menu, dropdown-menu — no imports anywhere).

### Task 1: Fix the one genuine physical-property bug

**Files:** Modify: `artifacts/jabeen-portal/src/pages/projects/tabs/updates-tab.tsx:732`

- [ ] Change the timeline-dot class `left-0` → `start-0` (mobile position must be inline-start; the `md:` variants are symmetric centering and stay).
- [ ] Verify the updates timeline renders correctly in both `dir` values in the running app.

### Task 2: Document intentional physical usages + icon inventory

**Files:** Create: `docs/rtl.md`

- [ ] Registry of intentional physical CSS (the categories above, with file references) so future sweeps don't re-litigate them.
- [ ] Icon-mirroring inventory: which icons flip (`.rtl-flip` — arrows, back/next chevrons), which stay fixed (logos, numerals, status icons, LogOut), and the calendar's `rtl:rotate-180` mechanism.
- [ ] Note the unused-boilerplate chevrons as Phase D cleanup candidates.

### Task 3: Both-direction verification on real pages

- [ ] Login page (pre-auth), a form (branding editor), and a data table (dashboard projects table) rendered in `dir="rtl"` and `dir="ltr"`: layout, alignment, icon direction correct. Evidence from the running preview.

### Task 4: Commit

- [ ] `git commit` on branch `claude/redesign-phase-c`.

**Pass condition (spec):** zero unexplained physical properties in `src/`; inventory documented; both-direction render check passes on the three page types.

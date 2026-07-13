# Phase E — Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared, reduced-motion-safe, direction-aware motion system and harden the four spec-mandated focus areas (form validation messages, empty investor-pipeline state, failed login state, dashboard loading skeletons), each verified in both Arabic (RTL) and English (LTR).

**Architecture:** Motion lives in CSS. A small motion foundation in `index.css` (shared eases/durations + `.skeleton-shimmer`, `.enter-rise`, `.attention-nudge`, `.stagger-rise` utilities, each guarded by one `prefers-reduced-motion` block and made `dir`-aware where directional) is consumed by a handful of targeted component/page edits. No new dependencies, no backend changes. Guidance sources per the spec: the `emil-design-eng` skill for easing/duration/micro-interaction decisions and the `impeccable` skill for hardening error/empty/edge states — an implementer should invoke the relevant skill before making a subjective motion or edge-state call.

**Tech Stack:** React 19 + Tailwind 4 + Vite (`artifacts/jabeen-portal`), CSS custom properties + `@keyframes` (no motion library beyond the existing `tw-animate-css`). i18n via i18next (`src/i18n/locales/{ar,en}.json`). Verification via the Browser-pane dev server (`.claude/launch.json` → `jabeen-portal`, port 5173) plus `tsc` typecheck; the Docker integration suite runs once at the end as a regression guard.

---

## Context an implementer needs (read before Task 1)

**This is a polish phase on an already-rebuilt app.** Phase D shipped, on `main` (547ad44):
- Real loading **skeletons** that mirror final layout: `DashboardSkeleton` (`pages/dashboard/dashboard.tsx:350`), `PageSkeleton`/`RailSkeleton` (`pages/investor/my-projects.tsx:248`/`:94`), all built from `components/ui/skeleton.tsx` (currently a bare `animate-pulse`).
- Hardened **empty / error / pending states** with retry buttons and icons on `my-projects.tsx` (empty `:323`, error `:314`, pending `:283`) and `dashboard.tsx` (table empty `:459`).
- A **failed-login** path: `login.tsx:232` renders `<Alert variant="destructive">` from `loginError` state (set at `:151`/`:154`); register mirrors it at `:294`.
- Inline **form validation**: `FieldError` (`login.tsx:68`) renders `<p className="text-sm text-destructive">`; inputs already carry `aria-invalid` + `aria-describedby`.
- A **global Button** (`components/ui/button.tsx`) that already has emil-style press feedback (`active:scale-[0.97]`, `motion-reduce:` guards, `focus-visible:ring-2`). Do **not** re-add press feedback to individual buttons.
- A **login motion block** in `index.css:296-392`: `--ease-out-strong`, `login-rise`, `login-press`, and one `@media (prefers-reduced-motion: reduce)` block (`:333`) that also neutralises the global page-entrance `.animate-in` reveals. Phase E **extends** this block; it does not duplicate it.

**So Phase E is refinement, not construction.** Every task below elevates something that already renders correctly.

**RTL rules (from `docs/rtl.md`):** `dir`/`lang` are set on `<html>` by `use-language.tsx`; layout uses logical utilities (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`); directional glyphs use `.rtl-flip`. Any new directional motion must follow the active `dir`; a symmetric motion (a shake, a vertical rise, a centered fade) is direction-neutral and needs no flip — but say so in a comment.

**Token rule:** colors come only from theme tokens (`var(--foreground)`, `bg-primary/10`, `text-destructive`, etc.). No raw hex, no hardcoded brand color.

### Preview verification protocol (referenced by every task's verify step)

1. Free port 5173 if a detached stack holds it, then start the dev server:
   - If `preview_start` reports the port in use: `docker compose -f .docker-run/docker-compose.yml down` (NOT `down -v` — that wipes the DB), then `preview_start` with `{ name: "jabeen-portal" }`.
   - Windows containers miss file-creation events: after **creating a new file** (not editing an existing one) restart the app container so Vite sees it. Editing existing files hot-reloads fine.
2. Switch language in-app with the header language switcher (`components/language-switcher.tsx`), or set it directly: `javascript_tool` → `localStorage.setItem('i18nextLng', 'ar'); location.reload()` (values: `ar` → RTL, `en` → LTR). Confirm `document.documentElement.dir` is `rtl`/`ltr` after reload.
3. Toggle dark mode with the header `ThemeToggle`, or `javascript_tool` → `document.documentElement.classList.toggle('dark')`, when a task touches dark-mode-sensitive color.
4. **Reduced-motion is verified statically** (the Browser pane cannot emulate `prefers-reduced-motion`): after any task that adds an animated utility, `grep -n` the `@media (prefers-reduced-motion: reduce)` block in `index.css` and confirm the new utility (or a selector covering it) neutralises its animation. This is a required, checkable step — not a manual "trust me."
5. Evidence: `computer {action:"screenshot"}` for visual states; `read_page` to confirm structure/aria; `read_console_messages` (onlyErrors) to confirm no runtime errors.

### Per-task closing steps (every task ends with these)

- **Typecheck:** `docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm typecheck"` → Expected: exit 0, no errors. (If the container name differs, find it with `docker ps --format '{{.Names}}' | grep app`.)
- **Commit** with a conventional message scoped to the task.

---

## Task 1: Motion foundation in `index.css`

Add the shared, reduced-motion-safe, `dir`-aware utilities that Tasks 2–6 consume. This task adds **only** what later tasks use (YAGNI) and folds every new animation into the single existing reduced-motion block.

**Files:**
- Modify: `artifacts/jabeen-portal/src/index.css` (append to the "Login experience polish" region, ~`:296-392`)

- [ ] **Step 1: Consult emil-design-eng for the easing/duration values**

Invoke the `emil-design-eng` skill and confirm the choices below read as intentional (short durations, a decelerating ease for entrances, a quick symmetric ease for the nudge). Adjust the numbers only if the skill gives a concrete reason; keep the token names.

- [ ] **Step 2: Add shared motion tokens + utilities**

Insert this block immediately **before** the existing `@keyframes login-rise` (keep `--ease-out-strong` where it is; add the new tokens to the same `:root`). Do not duplicate `--ease-out-strong`.

```css
/* ----------------------------------------------------------------------------
   Motion foundation (Phase E)
   Shared eases + a small set of reduced-motion-safe, dir-aware utilities.
   Only transform/opacity/background-position animate (GPU-friendly). Every
   utility here is neutralised in the single prefers-reduced-motion block below.
---------------------------------------------------------------------------- */
:root {
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --dur-fast: 150ms;
  --dur-base: 260ms;
}

/* Skeleton shimmer — a light band sweeping across a placeholder. The sweep
   travels with the reading direction: default L→R, reversed under [dir=rtl]. */
@keyframes skeleton-shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -100% 0; }
}
.skeleton-shimmer {
  background-image: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in oklab, var(--foreground) 9%, transparent) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  background-repeat: no-repeat;
  animation: skeleton-shimmer 1.6s ease-in-out infinite;
}
[dir="rtl"] .skeleton-shimmer {
  animation-direction: reverse;
}

/* Element entrance — gentle fade+rise for freshly revealed inline content
   (validation errors, inline alerts). Vertical + symmetric: direction-neutral. */
@keyframes enter-rise {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.enter-rise {
  animation: enter-rise var(--dur-base) var(--ease-out-strong);
}

/* Attention nudge — a small horizontal shake for a hard failure (failed login).
   Symmetric X displacement: identical in both directions, no dir flip needed. */
@keyframes attention-nudge {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-3px); }
  75%      { transform: translateX(3px); }
}
.attention-nudge {
  animation: attention-nudge var(--dur-fast) var(--ease-standard);
}

/* Staggered reveal — direct children fade+rise with an increasing delay.
   Used for the dashboard skeleton strip so blocks cascade rather than pop. */
.stagger-rise > * {
  animation: enter-rise var(--dur-base) var(--ease-out-strong) both;
}
.stagger-rise > *:nth-child(2) { animation-delay: 60ms; }
.stagger-rise > *:nth-child(3) { animation-delay: 120ms; }
.stagger-rise > *:nth-child(4) { animation-delay: 180ms; }
```

- [ ] **Step 3: Extend the existing reduced-motion block**

In the existing `@media (prefers-reduced-motion: reduce)` block (around `index.css:333`), add — inside the same block, alongside the existing `.login-rise`/`.login-press`/`.animate-in` rules — these neutralisers. Do **not** create a second media block.

```css
  /* Phase E motion utilities: hold their final resting state, no motion. */
  .skeleton-shimmer { animation: none; }
  .enter-rise,
  .attention-nudge,
  .stagger-rise > * { animation: none; }
```

- [ ] **Step 4: Verify the CSS compiles and reduced-motion coverage is complete**

Run: `docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm build"`
Expected: build succeeds (exit 0), no CSS parse errors.

Run: `grep -n "prefers-reduced-motion" artifacts/jabeen-portal/src/index.css`
Expected: exactly **one** match — confirming a single reduced-motion block.

Then confirm each new animated utility is neutralised (per protocol step 4): `grep -n "skeleton-shimmer\|enter-rise\|attention-nudge\|stagger-rise" artifacts/jabeen-portal/src/index.css` and eyeball that every one appears both as a definition and inside the reduce block.

- [ ] **Step 5: Typecheck and commit**

```bash
docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm typecheck"
git add artifacts/jabeen-portal/src/index.css
git commit -m "feat(portal): add Phase E motion foundation (shimmer, enter-rise, nudge, stagger)"
```

---

## Task 2: Skeleton shimmer

Upgrade the base `Skeleton` from a flat pulse to the dir-aware shimmer. This one edit propagates to every skeleton in the app (dashboard, my-projects, and any others).

**Files:**
- Modify: `artifacts/jabeen-portal/src/components/ui/skeleton.tsx`

- [ ] **Step 1: Swap the animation class**

Replace the class string. `bg-primary/10` stays as the base placeholder tint; the shimmer gradient (keyed to `--foreground`) rides on top; under reduced motion the block is a static `bg-primary/10` placeholder.

```tsx
import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-shimmer rounded-md bg-primary/10", className)}
      {...props}
    />
  )
}

export { Skeleton }
```

- [ ] **Step 2: Verify in the preview — both directions**

Bring up the dev server (protocol step 1). Sign in as a manager (`administrator`/`project-manager`) so the dashboard loads; throttle or catch the initial load to see skeletons, or navigate fresh to `/dashboard` (skeletons show during the first data fetch).
- LTR (`en`): confirm the shimmer band sweeps **left → right** across the KPI/chart skeletons. Screenshot.
- RTL (`ar`, protocol step 2): confirm the shimmer band sweeps **right → left**. Screenshot.
- `read_console_messages` (onlyErrors): none.

- [ ] **Step 3: Verify reduced-motion coverage (static)**

Per protocol step 4: confirm `.skeleton-shimmer { animation: none; }` is in the reduce block (added in Task 1). No new work — just confirm the propagation is covered.

- [ ] **Step 4: Typecheck and commit**

```bash
docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm typecheck"
git add artifacts/jabeen-portal/src/components/ui/skeleton.tsx
git commit -m "feat(portal): shimmer skeletons, dir-aware sweep with reduced-motion fallback"
```

---

## Task 3: Dashboard loading skeletons (focus area 4)

Make the dashboard skeleton **cascade in** rather than appear all at once, and confirm the skeleton→data handoff reads smoothly. This is the spec's "dashboard loading skeletons" focus area.

**Files:**
- Modify: `artifacts/jabeen-portal/src/pages/dashboard/dashboard.tsx` (`DashboardSkeleton`, ~`:350`)

- [ ] **Step 1: Consult impeccable for the loading-state decision**

Invoke the `impeccable` skill (loading/animate guidance) to confirm a staggered skeleton reveal is appropriate here (a dense manager dashboard) versus an instant show. Proceed with the stagger unless it advises otherwise.

- [ ] **Step 2: Apply the stagger to the skeleton's top-level rows**

`DashboardSkeleton` returns a `<div className="space-y-8">` with three direct children (KPI strip, chart grid, table). Add `stagger-rise` so those three cascade. The utility targets **direct children**, so no other change is needed.

Change the wrapper line in `DashboardSkeleton`:

```tsx
    <div className="space-y-8 stagger-rise">
```

(Leave the inner KPI cells, chart, and table skeleton markup exactly as-is.)

- [ ] **Step 3: Verify in the preview — both languages + smooth handoff**

Dev server up (protocol). As a manager, load `/dashboard`:
- `en` (LTR): the KPI strip, chart row, and table skeleton should fade+rise in sequence, then get replaced by real data without a jarring jump. Screenshot the skeleton frame.
- `ar` (RTL): repeat; the vertical rise is direction-neutral, so it looks identical mirror-wise, and any shimmer inside (Task 2) sweeps RTL. Screenshot.
- `read_console_messages` (onlyErrors): none.

- [ ] **Step 4: Verify reduced-motion (static)**

Per protocol step 4: `.stagger-rise > *` is neutralised in the reduce block (Task 1) — confirm, so under reduced motion the three rows show instantly.

- [ ] **Step 5: Typecheck and commit**

```bash
docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm typecheck"
git add artifacts/jabeen-portal/src/pages/dashboard/dashboard.tsx
git commit -m "feat(portal): stagger dashboard loading skeleton reveal (focus area)"
```

---

## Task 4: Empty investor-pipeline state (focus area 2)

Harden and gently animate the empty-portfolio state (and confirm its neighbours — pending and list-error — are consistent). This is the spec's "empty investor-pipeline state" focus area.

**Files:**
- Modify: `artifacts/jabeen-portal/src/pages/investor/my-projects.tsx` (empty `:323`, pending `:283`, error `:314`)

- [ ] **Step 1: Consult impeccable harden for empty-state quality**

Invoke the `impeccable` skill (harden/empty-state guidance). The empty state must be instructive (investors cannot self-create projects, so no CTA — it explains *why* it's empty and *what* will populate it). Confirm the existing copy (`investor.emptyTitle`/`investor.emptyDesc`) reads warmly; if the skill suggests a copy refinement, update **both** `ar.json` and `en.json` for the touched key and note it in the commit. Do not invent a CTA.

- [ ] **Step 2: Add a gentle entrance to the empty state**

Add `enter-rise` to the empty-state `<section>` so it fades in rather than popping when the query resolves to zero projects. Keep everything else identical.

Change the empty-state section opening tag (currently `:323`):

```tsx
        <section className="enter-rise rounded-xl border border-card-border bg-card px-6 py-16 text-center">
```

- [ ] **Step 3: Confirm sibling states stay visually consistent**

Read the `pending` (`:283`) and list-`error` (`:314`) sections. They share the `rounded-xl border border-card-border bg-card ... text-center` card idiom — good. Add `enter-rise` to the list-error `<section>` too (same one-class change) so a failed list load fades in consistently:

```tsx
        <section className="enter-rise rounded-xl border border-card-border bg-card px-6 py-14 text-center">
```

(Leave the `pending` section without an entrance — it is a durable state a user may sit on, not a transient reveal.)

- [ ] **Step 4: Verify in the preview — both languages**

Dev server up. Sign in as an **investor with no assigned projects** (empty portfolio). If no such fixture exists, temporarily force the empty branch by making `useListProjects` return `[]` via a devtools override, OR point at a seeded empty investor — prefer a real empty investor from the seed; note in the commit which you used.
- `en` (LTR): confirm the empty card fades in, icon + title + description read correctly, layout centered. Screenshot.
- `ar` (RTL): confirm text is right-aligned/centered correctly, the `FolderOpen` icon is centered (not mirrored — it is a neutral object icon), copy is the Arabic string. Screenshot.
- Also trigger the **list-error** branch (block the `/projects` request via `read_network_requests` inspection or stop the API briefly) to confirm its `enter-rise` + retry button render in both languages.
- `read_console_messages` (onlyErrors): none.

- [ ] **Step 5: Verify reduced-motion (static) + typecheck + commit**

Confirm `.enter-rise` is neutralised in the reduce block (Task 1).

```bash
docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm typecheck"
git add artifacts/jabeen-portal/src/pages/investor/my-projects.tsx artifacts/jabeen-portal/src/i18n/locales/ar.json artifacts/jabeen-portal/src/i18n/locales/en.json
git commit -m "feat(portal): animate + harden empty/error investor-pipeline states (focus area)"
```

(If Step 1 changed no copy, drop the two locale files from the `git add`.)

---

## Task 5: Failed login state (focus area 3)

Make the failed-login alert announce to assistive tech and enter with a purposeful motion. This is the spec's "failed login state" focus area.

**Files:**
- Modify: `artifacts/jabeen-portal/src/pages/auth/login.tsx` (login error alert `:232`, register error alert `:294`)
- Read-only reference: `artifacts/jabeen-portal/src/components/ui/alert.tsx` (confirm it sets `role`)

- [ ] **Step 1: Confirm the Alert's assertive semantics**

Read `components/ui/alert.tsx`. If the root already has `role="alert"`, the message is announced assertively — good. If it does **not**, add `role="alert"` on the destructive alert usages in `login.tsx` (Step 2) rather than editing the shared component. Record which case applied in the commit body.

- [ ] **Step 2: Add entrance + nudge to the login error alert**

The alert is conditionally rendered from `loginError`, so it mounts exactly when a login fails — the animation plays once per failure. Combine the fade-in with the attention nudge; both animate `transform`, so apply them as a single space-separated `animation` via the two utility classes on one wrapper is a conflict — instead put `enter-rise` on the `Alert` and let the nudge be the emphasis by using **only** `attention-nudge` here (a hard failure warrants the sharper signal). Choose `attention-nudge` for the failure alert:

```tsx
                    {loginError && (
                      <Alert variant="destructive" className="attention-nudge" role="alert">
                        <AlertCircle className="h-4 w-4" aria-hidden="true" />
                        <AlertDescription>{loginError}</AlertDescription>
                      </Alert>
                    )}
```

(If Step 1 found `alert.tsx` already sets `role="alert"`, drop the redundant `role` prop and keep just `className="attention-nudge"`.)

- [ ] **Step 3: Mirror the treatment on the register error alert**

Apply the identical change to the register error alert (`:294`) for consistency:

```tsx
                    {registerError && (
                      <Alert variant="destructive" className="attention-nudge" role="alert">
                        <AlertCircle className="h-4 w-4" aria-hidden="true" />
                        <AlertDescription>{registerError}</AlertDescription>
                      </Alert>
                    )}
```

- [ ] **Step 4: Verify in the preview — both languages**

Dev server up. On `/login`, submit valid-format but **wrong** credentials (e.g. `nobody@example.com` / `wrongpass`) so the server returns 401 and `loginError` is set.
- `en` (LTR): confirm the red alert nudges (a quick shake) on appearance and the message is the localized `auth.toast.invalidCredentials` (or server message). `read_page` and confirm the alert node has `role="alert"`. Screenshot.
- `ar` (RTL): repeat; the shake is symmetric so it looks the same; confirm the Arabic error copy and RTL alignment (icon on the inline-start via the Alert's logical layout). Screenshot.
- `read_console_messages` (onlyErrors): none.

- [ ] **Step 5: Verify reduced-motion (static) + typecheck + commit**

Confirm `.attention-nudge` is neutralised in the reduce block (Task 1) — under reduced motion the alert simply appears, still `role="alert"`-announced.

```bash
docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm typecheck"
git add artifacts/jabeen-portal/src/pages/auth/login.tsx
git commit -m "feat(portal): announce + nudge failed-login/register alerts (focus area)"
```

---

## Task 6: Form validation messages (focus area 1)

Give inline field errors a subtle reveal, consistently, without breaking their existing `aria-describedby` wiring or focus behavior. This is the spec's "form validation messages" focus area.

**Files:**
- Modify: `artifacts/jabeen-portal/src/pages/auth/login.tsx` (`FieldError`, `:68`)

- [ ] **Step 1: Add the entrance to `FieldError`**

`FieldError` is the shared inline-error renderer for both the login and register forms, so one edit covers every field on the auth surface. Add `enter-rise` to the `<p>`. Keep the `id` (for `aria-describedby`) and `text-destructive` exactly as-is.

```tsx
/** Inline field error (react-hook-form), programmatically tied to its input via id. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="enter-rise text-sm text-destructive">
      {message}
    </p>
  );
}
```

- [ ] **Step 2: Confirm focus + SR behavior is intact**

Do **not** add `aria-live` to `FieldError`: the field errors are already surfaced via each input's `aria-invalid` + `aria-describedby`, and react-hook-form focuses the first invalid field on submit (`shouldFocusError` default), so the described-by text is read on focus. Adding a live region would double-announce. Verify by reading the code that inputs still reference `${id}-error` in `aria-describedby` (they do at `:248`, `:262`, etc.) — no change needed.

- [ ] **Step 3: Verify in the preview — both languages**

Dev server up. On `/login`:
- `en` (LTR): submit the **empty** login form. Confirm both field errors fade+rise in, sit under their inputs, and are the localized `validation.*` strings. Tab to a field and confirm a screen-reader would read the error (structure via `read_page`: input `aria-describedby` points at the visible `<p id>`). Screenshot. Repeat on the **register** tab (more fields) to confirm the shared `FieldError` behaves everywhere.
- `ar` (RTL): repeat the empty-submit; confirm errors are right-aligned under inputs and show the Arabic `validation.*` copy. Screenshot.
- `read_console_messages` (onlyErrors): none.

- [ ] **Step 4: Verify reduced-motion (static) + typecheck + commit**

Confirm `.enter-rise` is neutralised in the reduce block (Task 1).

```bash
docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm typecheck"
git add artifacts/jabeen-portal/src/pages/auth/login.tsx
git commit -m "feat(portal): animate inline form validation messages (focus area)"
```

---

## Task 7: Micro-interactions + directional/reduced-motion audit + docs

Do the emil "invisible details" pass on interactive affordances, sweep every animation in the app for `dir` correctness and reduced-motion coverage, and record the motion system so future work stays consistent.

**Files:**
- Modify (only if the audit finds a concrete gap): interactive elements on `pages/dashboard/dashboard.tsx`, `pages/investor/my-projects.tsx`
- Create: `docs/motion.md`
- Modify: `docs/rtl.md` (add a short pointer to the motion registry)

- [ ] **Step 1: emil micro-interaction pass (audit, edit only where warranted)**

Invoke the `emil-design-eng` skill. Then audit these known interactive affordances and apply a `transition-colors duration-150 ... motion-reduce:transition-none` treatment **only where it is missing and meaningful** (do not churn files that already have it):
- Dashboard table rows (`dashboard.tsx:475` already has `hover:bg-muted/30 transition-colors` — leave as-is).
- Investor project links (`my-projects.tsx:144`/`:185` already have `transition-colors ... motion-reduce:transition-none` — leave as-is).
- The global `Button` already has press + focus states — **do not touch**.
Record in the commit body what you audited and what (if anything) you changed. It is a valid, expected outcome for this step to change **zero** component files because Phase D already applied these — in that case the deliverable is the audit note in `docs/motion.md`.

- [ ] **Step 2: Directional + reduced-motion sweep**

Enumerate every animation in `artifacts/jabeen-portal/src`:

```bash
grep -rn "animate-\|animation:\|transition\|\.login-\|enter-rise\|skeleton-shimmer\|attention-nudge\|stagger-rise\|slide-in\|slide-out\|fade-in\|fade-out" artifacts/jabeen-portal/src --include=*.tsx --include=*.css | grep -v "transition-none"
```

For each hit, confirm one of: (a) it is symmetric/vertical (direction-neutral), (b) it is `dir`-aware (`[dir=rtl]` rule or a logical property), or (c) it is a Radix `data-[side=…]` animation already resolved direction-correct per `docs/rtl.md`. Confirm each animated utility has a `prefers-reduced-motion` neutraliser (the login rules + the Task 1 additions should cover everything). List any exception found and fix it (convert to logical / add a reduce rule). Expected: no unmanaged physical or unguarded animation remains.

- [ ] **Step 3: Write `docs/motion.md`**

Create the motion registry mirroring the structure of `docs/rtl.md` (a "how motion works here" section + a table of every animation utility, its purpose, its direction behavior, and its reduced-motion fallback). Include the Phase E utilities (`skeleton-shimmer`, `enter-rise`, `attention-nudge`, `stagger-rise`) and the pre-existing login utilities (`login-rise`, `login-press`, `.animate-in` page reveals), each with: where defined, where consumed, dir behavior, reduced-motion behavior. State the two guiding principles from the spec: animations respect `prefers-reduced-motion`; directional motion follows the active `dir`.

- [ ] **Step 4: Cross-link from `docs/rtl.md`**

Add one line under the RTL doc's intro pointing to `docs/motion.md` for the motion-direction registry (so the two registries reference each other), e.g. append to the "How RTL works here" section:

```markdown
- Motion direction (slide/sweep origins, reduced-motion fallbacks) is documented
  separately in `docs/motion.md`.
```

- [ ] **Step 5: Verify + typecheck + commit**

Dev server up: spot-check one page in RTL to confirm no motion regression from any Step 2 fix (screenshot). Then:

```bash
docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm typecheck"
git add docs/motion.md docs/rtl.md artifacts/jabeen-portal/src
git commit -m "docs(portal): motion registry + directional/reduced-motion audit (Phase E)"
```

---

## Task 8: Full Phase E verification, regression, and wrap-up

Exercise all four focus areas in both languages back-to-back (the spec's pass condition), prove no backend regression, and finish the branch.

**Files:** none (verification + docs/memory + PR)

- [ ] **Step 1: Focus-area walkthrough — the pass condition**

With the dev server up, capture evidence for **all four focus areas in both `en` and `ar`** in one pass (8 screenshots):
1. **Form validation messages** — empty login + register submit (Task 6).
2. **Empty investor-pipeline state** — empty investor portfolio (Task 4).
3. **Failed login state** — wrong credentials (Task 5).
4. **Dashboard loading skeletons** — fresh `/dashboard` load (Tasks 2–3).

Confirm for each: correct localized copy, correct RTL/LTR alignment, animation present in motion-on and content still fully visible/legible. `read_console_messages` (onlyErrors) clean throughout.

- [ ] **Step 2: Reduced-motion final check (static)**

Run: `grep -c "prefers-reduced-motion" artifacts/jabeen-portal/src/index.css` → Expected: `1` (single block). Then confirm the block names every Phase E utility (`skeleton-shimmer`, `enter-rise`, `attention-nudge`, `stagger-rise`) plus the login utilities. This is the reduced-motion pass condition, verified where it is enforceable.

- [ ] **Step 3: Regression — backend integration suite + both typechecks**

Phase E is frontend-only; the suite must stay green as a regression guard (per memory, run each on a fresh DB). From the repo root:

```bash
docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/jabeen-portal && pnpm typecheck"
docker exec jabeen-run-app-1 bash -lc "cd /app/artifacts/api-server && pnpm typecheck"
node .docker-run/test-suite.mjs
node .docker-run/test-branding.mjs
node .docker-run/test-reports.mjs
```

Expected: both typechecks exit 0; test-suite 148/0, test-branding 18/18, test-reports 31/0. (Consult `memory/local-run-and-test.md` for how these harnesses are invoked if the direct `node` call needs the compose stack up.)

- [ ] **Step 4: Finish the branch**

Invoke the `superpowers:finishing-a-development-branch` skill and open a PR (`claude/redesign-phase-e-polish` → `main`) summarizing: the motion foundation, the four hardened focus areas, the reduced-motion + directional-motion guarantees, and `docs/motion.md`. Include representative before/after screenshots from Step 1.

- [ ] **Step 5: Update project memory**

Append a `redesign-phase-e.md` memory (type `project`) recording: Phase E shipped (motion foundation + 4 focus areas + `docs/motion.md`), the branch/PR, the key reusable utilities and their reduced-motion/dir contracts, and any review-catch patterns. Add its one-line pointer to `MEMORY.md`. Link `[[redesign-phase-d]]`, `[[redesign-phase-ab]]`. Note Phase F (QA) is next.

---

## Self-review

**Spec coverage (§Phase E):**
- "emil-design-eng for micro-interactions/animation decisions" → Tasks 1 (easing), 5, 6, 7 all invoke it for subjective calls. ✔
- "impeccable animate for page transitions and loading states" → Tasks 2, 3 (loading states); page-transition consistency audited in Task 7. ✔
- "impeccable harden for error, empty, and edge states" → Task 4 (empty/error), Task 5 (failed login). ✔
- Focus area: form validation messages (AR+EN) → Task 6 + Task 8 walkthrough. ✔
- Focus area: empty investor-pipeline state (AR+EN) → Task 4 + Task 8. ✔
- Focus area: failed login state (AR+EN) → Task 5 + Task 8. ✔
- Focus area: dashboard loading skeletons (AR+EN) → Tasks 2–3 + Task 8. ✔
- "Animations respect prefers-reduced-motion" → single reduce block extended in Task 1; each task confirms coverage; Task 8 Step 2 is the final gate. ✔
- "Directional motion follows active dir" → shimmer dir-aware (Task 1/2); Task 7 sweep audits all motion. ✔
- Pass condition ("all four focus areas exercised in both languages in the preview") → Task 8 Step 1. ✔

**Type/name consistency:** utility class names (`skeleton-shimmer`, `enter-rise`, `attention-nudge`, `stagger-rise`) and token names (`--ease-standard`, `--dur-fast`, `--dur-base`) are defined in Task 1 and referenced identically in Tasks 2–6. The reduce block lists the same four utilities everywhere.

**Placeholder scan:** every code step shows the exact class change or block; verification steps give concrete credentials, grep commands, and expected counts. No "add error handling"/"TBD" placeholders. The one deliberately open decision — whether `alert.tsx` already sets `role="alert"` — is resolved by a read step (Task 5 Step 1) with both branches spelled out.

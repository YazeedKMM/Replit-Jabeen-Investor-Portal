# Arabic RTL + Bilingual (i18n) UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the JABEEN portal fully bilingual (Arabic + English) with Arabic as the default, full RTL layout in Arabic, and IBM Plex Sans Arabic as the UI font — using react-i18next.

**Architecture:** i18next + react-i18next drive all UI strings from `ar.json`/`en.json`. A language controller sets `<html dir lang>` and persists the choice; Radix `DirectionProvider` flips component internals; Tailwind v4 logical-property utilities (`ms/me/ps/pe/start/end`) replace physical ones so layout mirrors automatically. DB-sourced data (project names, etc.) stays as stored; city/category get optional Arabic labels (Phase 5).

**Tech Stack:** React 19, Vite, Wouter, TanStack Query, shadcn/ui (Radix), Tailwind v4, i18next, react-i18next, i18next-browser-languagedetector, @radix-ui/react-direction, IBM Plex Sans Arabic (Google Fonts).

## Conventions & environment (read first)

- Repo root: `C:\Users\Yazeed\Downloads\Replit-Jabeen-Investor-Portal`. Frontend lives in `artifacts/jabeen-portal`.
- **Windows can't `pnpm install` (Linux-only workspace).** New dependencies must be added to `artifacts/jabeen-portal/package.json` and installed by **rebuilding the Docker image** (`docker compose -f .docker-run/docker-compose.yml up -d --build`), OR by `pnpm install` inside a Linux container. There is no host `node_modules` to rely on. Plan around this: add deps in Task 0.1, then rebuild once before any code that imports them is verified.
- Verification is in Docker: `docker compose -f .docker-run/docker-compose.yml up -d --build` (app at http://localhost:5173). Typecheck inside the container: `docker compose -f .docker-run/docker-compose.yml exec -T app bash -c "cd /app && pnpm exec tsc --build --force && pnpm --filter './artifacts/jabeen-portal' run typecheck"` (the `tsc --build --force` first step avoids a TS6305/implicit-any cascade).
- Tailwind v4 supports logical utilities and the `rtl:`/`ltr:` variants out of the box keyed off the `dir` attribute — no config needed.
- Work on a branch: `git checkout -b arabic-rtl-i18n` (from `main`).
- Commit per task. Translation tasks are large but mechanical; commit per page/area.

## Translation key convention

Namespaced flat keys, one JSON per language at `artifacts/jabeen-portal/src/i18n/locales/{ar,en}.json`. Top-level namespaces: `common`, `nav`, `auth`, `dashboard`, `projects`, `investor`, `admin`, `settings`, `audit`, `validation`, `status`, `roles`. Example: `t("dashboard.subtitle")`, `t("common.save")`. Every key added to BOTH `ar.json` and `en.json` in the same task. Never ship a key present in one file but not the other.

---

## Phase 0 — Infrastructure (font, i18n, direction, switcher)

### Task 0.1: Add dependencies

**Files:** `artifacts/jabeen-portal/package.json`

- [ ] **Step 1:** Add to `dependencies` (use these exact versions, compatible with React 19):
```json
"i18next": "^25.2.1",
"react-i18next": "^15.5.1",
"i18next-browser-languagedetector": "^8.0.4",
"@radix-ui/react-direction": "^1.1.0"
```
- [ ] **Step 2:** Rebuild the image to install: `docker compose -f .docker-run/docker-compose.yml up -d --build`. Expected: build succeeds, container starts, Vite serves :5173.
- [ ] **Step 3: Commit** `git add artifacts/jabeen-portal/package.json && git commit -m "chore(web): add i18next + radix-direction deps"`

### Task 0.2: Load IBM Plex Sans Arabic + set base dir/lang

**Files:** `artifacts/jabeen-portal/index.html`, `artifacts/jabeen-portal/src/index.css`

- [ ] **Step 1:** In `index.html`, set the default document direction and add the font. Change `<html lang="en">` to `<html lang="ar" dir="rtl">`. Add inside `<head>` after the existing font `<link>`:
```html
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
```
- [ ] **Step 2:** In `src/index.css`, update the font variable (keep Plus Jakarta as Latin fallback; IBM Plex Sans Arabic covers both scripts):
```css
  --app-font-sans: 'IBM Plex Sans Arabic', 'Plus Jakarta Sans', system-ui, sans-serif;
```
- [ ] **Step 3:** Add an RTL-safety utility block at the end of `src/index.css` (logical text alignment helpers + flip directional icons in RTL):
```css
@layer utilities {
  /* Mirror directional inline icons (arrows/chevrons) in RTL */
  [dir="rtl"] .rtl-flip { transform: scaleX(-1); }
}
```
- [ ] **Step 4: Commit** `git add artifacts/jabeen-portal/index.html artifacts/jabeen-portal/src/index.css && git commit -m "feat(web): IBM Plex Sans Arabic + default RTL document"`

### Task 0.3: i18next configuration + translation skeletons

**Files:** Create `artifacts/jabeen-portal/src/i18n/index.ts`, `artifacts/jabeen-portal/src/i18n/locales/ar.json`, `artifacts/jabeen-portal/src/i18n/locales/en.json`

- [ ] **Step 1:** Create `src/i18n/index.ts`:
```ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import ar from "./locales/ar.json";
import en from "./locales/en.json";

export const LANGS = ["ar", "en"] as const;
export type Lang = (typeof LANGS)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { ar: { translation: ar }, en: { translation: en } },
    fallbackLng: "ar",
    supportedLngs: LANGS,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "htmlTag"],
      lookupLocalStorage: "jabeen_lang",
      caches: ["localStorage"],
    },
  });

export default i18n;
```
- [ ] **Step 2:** Create `src/i18n/locales/en.json` and `ar.json` with the initial common keys (mirror exactly; fill Arabic translations):
```json
{
  "common": {
    "save": "Save", "cancel": "Cancel", "delete": "Delete", "edit": "Edit",
    "add": "Add", "search": "Search", "loading": "Loading…", "confirm": "Confirm",
    "close": "Close", "back": "Back", "next": "Next", "yes": "Yes", "no": "No",
    "actions": "Actions", "enabled": "Enabled", "disabled": "Disabled",
    "allCities": "All cities", "required": "Required"
  },
  "nav": {
    "myProjects": "My Projects", "dashboard": "Dashboard", "templates": "Templates",
    "users": "Users", "cities": "Cities", "categories": "Project Categories",
    "auditLog": "Audit Log", "settings": "Settings", "profile": "Profile", "signOut": "Sign out"
  },
  "language": { "switchTo": "العربية", "current": "EN" }
}
```
`ar.json` (same keys, Arabic values):
```json
{
  "common": {
    "save": "حفظ", "cancel": "إلغاء", "delete": "حذف", "edit": "تعديل",
    "add": "إضافة", "search": "بحث", "loading": "جارٍ التحميل…", "confirm": "تأكيد",
    "close": "إغلاق", "back": "رجوع", "next": "التالي", "yes": "نعم", "no": "لا",
    "actions": "إجراءات", "enabled": "مُفعّل", "disabled": "مُعطّل",
    "allCities": "كل المدن", "required": "مطلوب"
  },
  "nav": {
    "myProjects": "مشاريعي", "dashboard": "لوحة التحكم", "templates": "القوالب",
    "users": "المستخدمون", "cities": "المدن", "categories": "تصنيفات المشاريع",
    "auditLog": "سجل التدقيق", "settings": "الإعدادات", "profile": "الملف الشخصي", "signOut": "تسجيل الخروج"
  },
  "language": { "switchTo": "EN", "current": "العربية" }
}
```
- [ ] **Step 3: Commit** `git add artifacts/jabeen-portal/src/i18n && git commit -m "feat(web): i18next config + base ar/en locale files"`

### Task 0.4: Direction controller + wire providers into the app

**Files:** Create `artifacts/jabeen-portal/src/hooks/use-language.tsx`; modify `artifacts/jabeen-portal/src/main.tsx`, `artifacts/jabeen-portal/src/App.tsx`

- [ ] **Step 1:** Create `src/hooks/use-language.tsx` — keeps `<html dir lang>` synced to i18next and exposes a toggle:
```tsx
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Lang } from "@/i18n";

export function useLanguage() {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? "ar") as Lang;
  const dir: "rtl" | "ltr" = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = (next: Lang) => i18n.changeLanguage(next);
  const toggle = () => setLang(lang === "ar" ? "en" : "ar");
  return { lang, dir, setLang, toggle };
}
```
- [ ] **Step 2:** In `src/main.tsx`, import i18n before rendering and wrap in Suspense:
```tsx
import { createRoot } from "react-dom/client";
import { Suspense } from "react";
import App from "./App";
import "./i18n";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <Suspense fallback={null}>
    <App />
  </Suspense>
);
```
- [ ] **Step 3:** In `src/App.tsx` (read it first), wrap the app tree in Radix `DirectionProvider` whose `dir` follows the language, and call `useLanguage()` once near the top so `<html>` stays synced. Create a small wrapper component inside App:
```tsx
import { DirectionProvider } from "@radix-ui/react-direction";
import { useLanguage } from "@/hooks/use-language";
// ...
function DirectionRoot({ children }: { children: React.ReactNode }) {
  const { dir } = useLanguage();
  return <DirectionProvider dir={dir}>{children}</DirectionProvider>;
}
```
Wrap the existing providers/router with `<DirectionRoot>…</DirectionRoot>` (inside QueryClientProvider/AuthProvider, around the router). Match App.tsx's existing structure.
- [ ] **Step 4: Verify** rebuild + load app; confirm `<html dir="rtl" lang="ar">` and Arabic font renders. **Commit** `git add -A artifacts/jabeen-portal/src && git commit -m "feat(web): language/direction controller + providers"`

### Task 0.5: Language switcher in the header

**Files:** Create `artifacts/jabeen-portal/src/components/language-switcher.tsx`; modify `artifacts/jabeen-portal/src/components/layout/header.tsx`

- [ ] **Step 1:** Create `language-switcher.tsx`:
```tsx
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

export function LanguageSwitcher() {
  const { lang, toggle } = useLanguage();
  return (
    <Button variant="ghost" size="sm" onClick={toggle} data-testid="language-switcher" className="gap-2">
      <Languages className="h-4 w-4" />
      {lang === "ar" ? "EN" : "العربية"}
    </Button>
  );
}
```
- [ ] **Step 2:** In `header.tsx`, import and render `<LanguageSwitcher />` in the right-hand control cluster (next to the notifications bell / `CitySwitcher`).
- [ ] **Step 3:** Add the switcher to the **login page** too (it is standalone and does NOT use `Header`/`AppLayout`, so it needs its own). In `pages/auth/login.tsx`, render `<LanguageSwitcher />` absolutely positioned in the top corner on the **start side of the form panel** (the right/form column), e.g. inside the form-side container: `<div className="absolute top-4 end-4 z-20"><LanguageSwitcher /></div>`. It works pre-auth because i18n is global and the switcher only calls `i18n.changeLanguage`. Confirm toggling on the login screen flips the page to RTL/Arabic immediately and persists.
- [ ] **Step 4: Commit** `git add -A artifacts/jabeen-portal/src && git commit -m "feat(web): language switcher in header and on login page"`

---

## Phase 1 — RTL layout foundation

### Task 1.1: Convert physical → logical Tailwind utilities

**Files:** all `.tsx` under `artifacts/jabeen-portal/src` (~245 occurrences across pages, layout, and `components/ui`).

Do this **per directory** (commit per batch) to keep diffs reviewable. Apply this mapping ONLY to directional utilities; positioning that is genuinely physical can stay, but for mirroring prefer logical:

| Physical | Logical (RTL-aware) |
| --- | --- |
| `ml-X` | `ms-X` |
| `mr-X` | `me-X` |
| `pl-X` | `ps-X` |
| `pr-X` | `pe-X` |
| `left-X` (inset) | `start-X` |
| `right-X` (inset) | `end-X` |
| `text-left` | `text-start` |
| `text-right` | `text-end` |
| `space-x-X` | keep, but add `rtl:space-x-reverse` (or switch the row to `gap-X` which is direction-agnostic — preferred) |
| `rounded-l-*` / `rounded-r-*` | `rounded-s-*` / `rounded-e-*` |
| `border-l` / `border-r` | `border-s` / `border-e` |

- [ ] **Step 1:** For each directory (`components/ui`, then `components/layout`, then `pages/**`), find occurrences: `grep -rnE "\b(ml-|mr-|pl-|pr-|text-left|text-right|space-x-|rounded-l-|rounded-r-|border-l|border-r|left-|right-)" <dir> --include="*.tsx"`. Convert per the table. For `left-/right-` only convert when used for positioning that should mirror (e.g. a dropdown offset, an absolutely-positioned icon); leave centering helpers like `right-1/2` paired with transforms after checking.
- [ ] **Step 2:** Prefer replacing `space-x-*` rows with `gap-*` on a flex parent (cleaner under RTL). Where a fixed icon sits at one side (e.g. search input icon), use `start-*`/`ps-*`.
- [ ] **Step 3:** After each directory batch, rebuild and visually confirm nothing shifted in LTR (English), then commit: `git commit -m "refactor(web): logical Tailwind utilities for RTL (<dir>)"`.

### Task 1.2: Mirror directional icons

**Files:** any `.tsx` using `ArrowRight`, `ArrowLeft`, `ChevronRight`, `ChevronLeft`, `ArrowRight` in "next/back/view details" affordances (e.g. `my-projects.tsx`, `login.tsx`, pagination, breadcrumbs).

- [ ] **Step 1:** For inline directional arrows that indicate forward/back motion, add the `rtl-flip` class (defined in Task 0.2) so they mirror in Arabic, e.g. `<ArrowRight className="h-4 w-4 rtl-flip" />`. Do NOT flip icons whose meaning is absolute (e.g. a checkmark, a calendar).
- [ ] **Step 2:** For Radix-driven chevrons inside shadcn primitives (select, dropdown, accordion), the `DirectionProvider` handles placement; only flip standalone decorative arrows.
- [ ] **Step 3: Commit** `git commit -m "feat(web): mirror directional icons in RTL"`

### Task 1.3: Login split layout + sidebar side under RTL

**Files:** `artifacts/jabeen-portal/src/pages/auth/login.tsx`, `artifacts/jabeen-portal/src/components/ui/sidebar.tsx` (or `sidebar-nav.tsx`)

- [ ] **Step 1:** Login: the brand panel (`md:w-1/2 lg:w-[60%]`) and form panel use `flex-row`; under RTL flexbox already reverses visual order — verify the brand panel sits on the right in Arabic and the scrim gradient still favors the text side (the legibility gradient is `105deg`; mirror it for RTL by adding an `rtl:` override or switching to a logical/symmetric gradient). Add an `rtl:[background:...]` override or make the scrim symmetric.
- [ ] **Step 2:** Sidebar: shadcn `Sidebar` defaults to `side="left"`. Make it follow direction — pass `side={dir === "rtl" ? "right" : "left"}` (read `useLanguage()` in `sidebar-nav.tsx`) so the nav rail anchors on the start side. Verify the collapse/rail logic still works.
- [ ] **Step 3: Verify** in both languages; **commit** `git commit -m "feat(web): RTL-correct login split + sidebar side"`

---

## Phase 2 — Translate shared chrome

### Task 2.1: Layout & navigation strings

**Files:** `components/layout/sidebar-nav.tsx`, `header.tsx`, `notification-panel.tsx`, `components/city-switcher.tsx`, `protected-route.tsx`, and any shared status/role label helpers.

- [ ] **Step 1:** Replace literal strings with `const { t } = useTranslation();` + `t("nav.*")`, `t("common.*")`. Examples: sidebar items use `t("nav.dashboard")` etc. (keys already exist from Task 0.3). City switcher placeholder → `t("common.allCities")`.
- [ ] **Step 2:** Add a `status`/`roles` namespace for derived status labels (`on-track`→`على المسار`, `delayed`→`متأخر`, `stalled`→`متعثر`, `complete`→`مكتمل`) and role labels (`investor`→`مستثمر`, `project-manager`→`مدير مشروع`, `top-management`→`الإدارة العليا`, `administrator`→`مدير النظام`). Add to both JSONs. Replace the `getStatusLabel`/role displays to use `t("status."+key)` / `t("roles."+key)`.
- [ ] **Step 3: Commit** `git commit -m "feat(i18n): translate layout, nav, status, role labels"`

---

## Phase 3 — Translate pages (one task per area; add keys to both JSONs)

For every task below: read the file, wrap it with `useTranslation()`, replace each user-visible literal with `t("<ns>.<key>")`, and add the key+Arabic+English to both locale files. Keep `data-testid`s. Numbers/dates are handled in Phase 4 — for now leave them.

### Task 3.1: Auth pages
**Files:** `pages/auth/login.tsx`, `pages/auth/mfa-setup.tsx`, `pages/auth/mfa-verify.tsx`
- [ ] Translate headings, labels, placeholders, button text, toasts, the brand headline/sub-copy/chip/footer. Namespace `auth.*`. Example: `auth.welcomeBack`, `auth.workEmail`, `auth.password`, `auth.signInToPortal`, `auth.brandHeadline`, `auth.brandSubcopy`. Commit `feat(i18n): translate auth pages`.

### Task 3.2: Dashboard
**Files:** `pages/dashboard/dashboard.tsx`
- [ ] Translate title/subtitle, KPI labels, table headers (City/Category/Status/etc.), the create-project dialog (labels, placeholders, buttons), "By Category"/"By City" headings, empty states. Namespace `dashboard.*`, `projects.*`. Commit `feat(i18n): translate dashboard`.

### Task 3.3: Investor My Projects
**Files:** `pages/investor/my-projects.tsx`
- [ ] Translate title/subtitle, card labels (Plot/Current Stage/Project Progress/Updated/View details), pending-activation card, empty state. Namespace `investor.*`, reuse `projects.*`. Commit `feat(i18n): translate my-projects`.

### Task 3.4: Project workspace + tabs
**Files:** `pages/projects/project-workspace.tsx`, `pages/projects/tabs/{overview,updates,documents,messages,internal-notes,manage}-tab.tsx`
- [ ] Translate tab labels, field labels, buttons, dialog copy, status/empty messages, the manage/edit form (City/Project Category/Investor/Pipeline/Notes/Attention flag/Danger zone). Namespace `projects.*`. This is the largest area — commit per tab if helpful. Commit `feat(i18n): translate project workspace + tabs`.

### Task 3.5: Admin pages
**Files:** `pages/admin/{users,templates,template-builder,cities,categories}.tsx`
- [ ] Translate page titles, table columns, dialogs, the PM city-assignment control, in-use error toasts, validation messages. Namespace `admin.*`. Commit `feat(i18n): translate admin pages`.

### Task 3.6: Settings, profile, audit, not-found
**Files:** `pages/settings/settings.tsx`, `pages/profile/profile.tsx`, `pages/audit/audit-log.tsx`, `pages/not-found.tsx`
- [ ] Translate remaining chrome. Namespaces `settings.*`, `profile.*`, `audit.*`, `common.*`. Commit `feat(i18n): translate settings/profile/audit/not-found`.

---

## Phase 4 — Formatting & validation

### Task 4.1: Locale-aware number/date formatting
**Files:** Create `artifacts/jabeen-portal/src/lib/format.ts`; update call sites that use `date-fns` `format()` or raw number rendering.
- [ ] **Step 1:** Create helpers tied to the active language:
```ts
import i18n from "@/i18n";
// Use Latin digits in Arabic for finance/IDs (common in KSA business UIs): locale "ar" + nu-latn.
const locale = () => (i18n.resolvedLanguage === "ar" ? "ar-SA-u-nu-latn" : "en-US");
export const fmtNumber = (n: number) => new Intl.NumberFormat(locale()).format(n);
export const fmtPercent = (n: number) => new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: 0 }).format(n / 100);
export const fmtDate = (d: Date | string) => new Intl.DateTimeFormat(locale(), { dateStyle: "medium" }).format(new Date(d));
```
- [ ] **Step 2:** Replace `format(new Date(x), 'MMM d, yyyy')` (date-fns) and percent/number renders in cards/tables with these helpers. (Decision: Latin digits even in Arabic — change `nu-latn` to remove it if Arabic-Indic digits are preferred.)
- [ ] **Step 3: Commit** `feat(i18n): locale-aware number/date formatting`

### Task 4.2: Validation messages
**Files:** all files with `z.object({...})` schemas (login, dashboard create, manage-tab, register, admin forms).
- [ ] **Step 1:** Add a `validation` namespace (`required`, `invalidEmail`, `minLength`, `passwordMin`, etc.) to both JSONs. Replace inline zod messages with keys resolved at render: define schemas inside the component using `t`, e.g. `z.string().email(t("validation.invalidEmail"))`. (Move schema creation inside the component or a `useMemo(() => schema, [t])`.)
- [ ] **Step 2: Commit** `feat(i18n): translate form validation messages`

---

## Phase 5 — (Optional) Arabic labels for cities & categories

Only if dynamic catalog data should render in Arabic. Skippable for a first release.

- [ ] **Step 1 (DB):** Add `nameAr` (and `shortNameAr` for cities) columns to `cities` and `project_categories` schemas; seed official Arabic names (Jubail → الجبيل, Yanbu → ينبع, Ras Al-Khair → رأس الخير, Jazan → جازان).
- [ ] **Step 2 (API + spec):** Include the Arabic fields in the city/category responses and admin create/update bodies; run orval codegen (in-image, per the memory note).
- [ ] **Step 3 (UI):** In badges/selectors, pick `lang === "ar" ? city.shortNameAr : city.shortName` (fallback to the English field). Admin forms get Arabic-name inputs.
- [ ] **Step 4:** Extend the integration suite for the new fields. Commit `feat: bilingual city/category labels`.

---

## Phase 6 — Verification

### Task 6.1: Build, typecheck, suite
- [ ] Clean rebuild: `docker compose -f .docker-run/docker-compose.yml down -v && docker compose -f .docker-run/docker-compose.yml up -d --build`; wait for "Seed complete." + "Server listening".
- [ ] Typecheck: `docker compose ... exec -T app bash -c "cd /app && pnpm exec tsc --build --force && pnpm --filter './artifacts/jabeen-portal' run typecheck"` → clean.
- [ ] Integration suite (unaffected by UI i18n, must stay green): `node .docker-run/test-suite.mjs` → 148 passed.

### Task 6.2: Visual RTL/LTR audit (CDP screenshots)
- [ ] Screenshot login + an authenticated page in **Arabic (default)** and after toggling **English**, at desktop and mobile widths. Confirm: text reads RTL in Arabic; sidebar on the right; icons mirrored; no clipped/overlapping layout; IBM Plex Sans Arabic renders; numbers/dates formatted; toggle persists across reload (localStorage `jabeen_lang`).
- [ ] **Missing-key audit:** in dev, set i18next `saveMissing`/`missingKeyHandler` temporarily (or grep the rendered DOM) to ensure no raw `t("…")` keys leak. Fix any untranslated literals found.
- [ ] **Commit** any fixes; finish via superpowers:finishing-a-development-branch (merge/PR).

---

## Risks & notes
- **Biggest effort is Phase 1 (245 utilities) + Phase 3 (string extraction across 25 files).** Budget accordingly; both are mechanical and subagent-friendly (one directory/area per subagent).
- **shadcn `components/ui` primitives** mostly inherit RTL from `DirectionProvider`; audit only the ones with hardcoded `left/right` (sidebar, dropdown-menu side offsets, toast position, sheet side).
- **Toasts** (`sonner`/use-toast): position should follow direction (top-right LTR → top-left RTL) — set via the Toaster `position`/`dir` prop based on `useLanguage()`.
- **Dynamic DB data** is not auto-translated (Phase 5 covers cities/categories only). Project names, agreement numbers, plot numbers, investor names render as stored.
- **Number digits decision** (Latin vs Arabic-Indic) is centralized in `src/lib/format.ts` — flip in one place.
- Keep `ar.json` and `en.json` key-for-key identical; consider a tiny CI/grep check that both files have the same key set.

## Self-Review
- Covers: font (0.2), i18n engine + default Arabic (0.3), dir/lang + Radix + Suspense (0.4), switcher (0.5), logical-property RTL (1.1), icon mirroring (1.2), login/sidebar RTL specifics (1.3), full string extraction across every page/area (2–3), formatting + validation i18n (4), optional bilingual data (5), and build/typecheck/suite/visual verification (6).
- No placeholders in infrastructure tasks (full code given). Translation tasks are necessarily methodology + per-area scope with concrete key examples — an executor extracts strings file-by-file using the established `t()` pattern and adds keys to both JSONs.
- Dependency-install-on-Windows constraint and the codegen-in-image + `tsc --build --force` gotchas are called out so the executor doesn't get blocked.

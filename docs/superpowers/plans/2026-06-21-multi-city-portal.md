# Multi-City Portal & Configurable Project Categories — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the JABEEN portal serve all four Royal Commission cities with city-scoped Project Managers, replace free-text `sector` with an admin-managed Project Category, and generalize "industrial project" copy to "JABEEN projects".

**Architecture:** Drizzle schema gains `cities`, `project_categories`, and a `user_cities` join table; `projects` gains `cityId` + `categoryId` (replacing `sector`). Express routes add admin CRUD for cities/categories and PM↔city assignment, and the projects routes filter/enforce by a PM's assigned cities. The OpenAPI spec is extended and orval regenerates the typed React-Query client. The frontend adds a header city switcher (URL-persisted), city/category selectors and badges, and two admin management screens.

**Tech Stack:** TypeScript, Express, Drizzle ORM (Postgres, `push-force`), Zod, OpenAPI + orval codegen, React + Wouter + TanStack Query + shadcn/ui, Tailwind. Tests = cross-role integration suite (`.docker-run/test-suite.mjs`) run in Docker.

## Conventions & key commands

Run everything from the repo root `C:\Users\Yazeed\Downloads\Replit-Jabeen-Investor-Portal` unless noted. This is a Linux-only workspace; the app runs in Docker (see `.docker-run/`). Local `tsc`/`vite` cannot run on Windows natively — verification happens inside the container.

- **Regenerate API client + zod types:** `pnpm --filter @workspace/api-spec run codegen`
- **Push DB schema (in container):** part of `.docker-run/entrypoint.sh` (`pnpm --filter @workspace/db run push-force`)
- **Rebuild + run stack:** `docker compose -f .docker-run/docker-compose.yml up -d --build`
- **Clean slate (drop volumes):** `docker compose -f .docker-run/docker-compose.yml down -v`
- **Run integration suite:** `node .docker-run/test-suite.mjs`
- **Typecheck libs:** `pnpm -w run typecheck:libs`

**Testing model:** the repo has no unit-test runner; the test vehicle is the cross-role integration suite. So each backend task's "test" is one or more assertions added to `.docker-run/test-suite.mjs`, run against a freshly rebuilt+reseeded stack. Frontend tasks are verified via typecheck/build inside the container and a CDP screenshot. "Commit" steps are real — commit frequently on the `multi-city-portal` branch.

**Migration note (push-force):** because the workspace uses `drizzle-kit push` (not versioned migrations) and the integration harness recreates the DB from `down -v` + push + seed, new NOT NULL FK columns on `projects` are made non-null in the schema and satisfied by the seed (which sets `cityId`/`categoryId` on every project). The clean-slate rollout for any existing data is `down -v` then rebuild. A production backfill migration is out of scope (noted in the spec).

---

## Phase 1 — Data model

### Task 1: City, ProjectCategory, and user_cities schemas

**Files:**
- Create: `lib/db/src/schema/cities.ts`
- Create: `lib/db/src/schema/project_categories.ts`
- Create: `lib/db/src/schema/user_cities.ts`
- Modify: `lib/db/src/schema/index.ts`

- [ ] **Step 1: Create `cities.ts`**

```ts
import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const citiesTable = pgTable("cities", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type City = typeof citiesTable.$inferSelect;
```

- [ ] **Step 2: Create `project_categories.ts`**

```ts
import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const projectCategoriesTable = pgTable("project_categories", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectCategory = typeof projectCategoriesTable.$inferSelect;
```

- [ ] **Step 3: Create `user_cities.ts`**

```ts
import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { citiesTable } from "./cities";

export const userCitiesTable = pgTable("user_cities", {
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  cityId: integer("city_id").notNull().references(() => citiesTable.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.cityId] }),
}));

export type UserCity = typeof userCitiesTable.$inferSelect;
```

- [ ] **Step 4: Export from `index.ts`** — add these lines after `export * from "./users";`

```ts
export * from "./cities";
export * from "./project_categories";
export * from "./user_cities";
```

- [ ] **Step 5: Commit**

```bash
git add lib/db/src/schema/cities.ts lib/db/src/schema/project_categories.ts lib/db/src/schema/user_cities.ts lib/db/src/schema/index.ts
git commit -m "feat(db): add cities, project_categories, user_cities tables"
```

### Task 2: Add cityId + categoryId to projects, remove sector

**Files:**
- Modify: `lib/db/src/schema/projects.ts`

- [ ] **Step 1: Edit imports** — add the two new tables to the import block at top:

```ts
import { citiesTable } from "./cities";
import { projectCategoriesTable } from "./project_categories";
```

- [ ] **Step 2: Replace the `sector` column** with the two FK columns. In `projectsTable`, delete the line `sector: text("sector").notNull(),` and add (place after `name`):

```ts
  cityId: integer("city_id").notNull().references(() => citiesTable.id, { onDelete: "restrict" }),
  categoryId: integer("category_id").notNull().references(() => projectCategoriesTable.id, { onDelete: "restrict" }),
```

(`integer` is already imported in `projects.ts`.)

- [ ] **Step 3: Commit**

```bash
git add lib/db/src/schema/projects.ts
git commit -m "feat(db): replace projects.sector with cityId + categoryId FKs"
```

> Note: the backend `sector` references (projects route, seed, export CSV) will not typecheck until Tasks 4 and 10–14 are done. That's expected — those tasks land together before the first full rebuild in Task 16.

---

## Phase 2 — Seed

### Task 3: Seed cities, categories, and wire them into projects + PM assignment

**Files:**
- Modify: `artifacts/api-server/src/seed.ts`

Read `artifacts/api-server/src/seed.ts` fully first — it is upsert-based (no truncate) and seeds users, a stage template, and sample projects. You will (a) seed cities + categories before projects, (b) give each sample project a `cityId` + `categoryId` instead of `sector`, and (c) assign PM `pm1` to JUB+YNB.

- [ ] **Step 1: Import the new tables** — add to the existing `@workspace/db` import in `seed.ts`:

```ts
import { citiesTable, projectCategoriesTable, userCitiesTable } from "@workspace/db";
```

- [ ] **Step 2: Seed the four cities (idempotent) — add a block before the projects are seeded**

```ts
// ── Cities (RCJY) ──────────────────────────────────────────────────
const CITY_SEED = [
  { code: "JUB", name: "Jubail Industrial City", shortName: "Jubail", sortOrder: 1 },
  { code: "YNB", name: "Yanbu Industrial City", shortName: "Yanbu", sortOrder: 2 },
  { code: "RAS", name: "Ras Al-Khair City for Mining Industries", shortName: "Ras Al-Khair", sortOrder: 3 },
  { code: "JZN", name: "Jazan City for Primary and Downstream Industries", shortName: "Jazan", sortOrder: 4 },
];
const cityIdByCode: Record<string, number> = {};
for (const c of CITY_SEED) {
  const [existing] = await db.select().from(citiesTable).where(eq(citiesTable.code, c.code));
  if (existing) { cityIdByCode[c.code] = existing.id; continue; }
  const [row] = await db.insert(citiesTable).values(c).returning();
  cityIdByCode[c.code] = row.id;
  console.log(`  Created city: ${c.code}`);
}
```

- [ ] **Step 3: Seed starter categories (idempotent)**

```ts
// ── Project Categories ─────────────────────────────────────────────
const CATEGORY_SEED = [
  { code: "PETRO", name: "Petrochemical", sortOrder: 1 },
  { code: "OILGAS", name: "Oil & Gas", sortOrder: 2 },
  { code: "MINING", name: "Mining", sortOrder: 3 },
  { code: "COMMERCIAL", name: "Commercial", sortOrder: 4 },
  { code: "ENTERTAINMENT", name: "Entertainment", sortOrder: 5 },
];
const categoryIdByCode: Record<string, number> = {};
for (const c of CATEGORY_SEED) {
  const [existing] = await db.select().from(projectCategoriesTable).where(eq(projectCategoriesTable.code, c.code));
  if (existing) { categoryIdByCode[c.code] = existing.id; continue; }
  const [row] = await db.insert(projectCategoriesTable).values(c).returning();
  categoryIdByCode[c.code] = row.id;
  console.log(`  Created category: ${c.code}`);
}
```

- [ ] **Step 4: Update sample project inserts** — for every sample project object, replace its `sector: "..."` property with `cityId` + `categoryId`, distributing across cities. Example mapping (apply the same shape to each sample project, varying the city/category so all four cities are represented):

```ts
// was: sector: "Petrochemicals",
cityId: cityIdByCode.JUB, categoryId: categoryIdByCode.PETRO,
// next sample project:
cityId: cityIdByCode.YNB, categoryId: categoryIdByCode.OILGAS,
// next:
cityId: cityIdByCode.RAS, categoryId: categoryIdByCode.MINING,
// next:
cityId: cityIdByCode.JZN, categoryId: categoryIdByCode.COMMERCIAL,
```

If projects are inserted in a loop with a shared object, add `cityId`/`categoryId` to each element of the source array and remove `sector`.

- [ ] **Step 5: Assign PM `pm1` to JUB + YNB (idempotent)** — add after users are seeded and cities exist. Look up the pm1 user id by email `pm1@jabeen.sa`:

```ts
// ── PM city assignments (demonstrate multi-city scoping) ───────────
const [pm1] = await db.select().from(usersTable).where(eq(usersTable.email, "pm1@jabeen.sa"));
if (pm1) {
  for (const code of ["JUB", "YNB"]) {
    const cityId = cityIdByCode[code];
    const [existing] = await db.select().from(userCitiesTable)
      .where(and(eq(userCitiesTable.userId, pm1.id), eq(userCitiesTable.cityId, cityId)));
    if (!existing) await db.insert(userCitiesTable).values({ userId: pm1.id, cityId });
  }
  console.log("  Assigned pm1 to JUB, YNB");
}
```

Ensure `and` and `eq` are imported in `seed.ts` (add to the `drizzle-orm` import if missing).

- [ ] **Step 6: Update the stage template description string** — change `"Standard industrial project lifecycle for Jubail Industrial City per RCJY guidelines"` to `"Standard project lifecycle across Royal Commission industrial cities per RCJY guidelines"`.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/seed.ts
git commit -m "feat(seed): seed cities + categories, assign pm1 to JUB/YNB"
```

---

## Phase 3 — Backend: scoping helper, CRUD routes, PM assignment

### Task 4: PM city-scope helper in requireAuth

**Files:**
- Modify: `artifacts/api-server/src/middlewares/requireAuth.ts`

- [ ] **Step 1: Add a `CITY_SCOPED_ROLE` constant and an assigned-cities loader.** Append at the bottom of the file:

```ts
import { userCitiesTable } from "@workspace/db";

// Roles whose project visibility is limited to assigned cities.
export const CITY_SCOPED_ROLES = ["project-manager"] as const;

/** Returns the city IDs a user is assigned to (only meaningful for project-manager). */
export async function getAssignedCityIds(userId: number): Promise<number[]> {
  const rows = await db.select({ cityId: userCitiesTable.cityId })
    .from(userCitiesTable)
    .where(eq(userCitiesTable.userId, userId));
  return rows.map((r) => r.cityId);
}
```

(`db` and `eq` are already imported in this file.)

- [ ] **Step 2: Commit**

```bash
git add artifacts/api-server/src/middlewares/requireAuth.ts
git commit -m "feat(api): add CITY_SCOPED_ROLES + getAssignedCityIds helper"
```

### Task 5: Cities route (list + admin CRUD with in-use guard)

**Files:**
- Create: `artifacts/api-server/src/routes/cities.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

- [ ] **Step 1: Create `cities.ts`**

```ts
import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { citiesTable, projectsTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest, ADMIN_ROLE } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { parseId } from "../lib/http";

const router: IRouter = Router();

// Any authenticated user can read the city list (needed for selectors/switcher).
router.get("/cities", requireAuth, async (_req: AuthenticatedRequest, res): Promise<void> => {
  const rows = await db.select().from(citiesTable).orderBy(asc(citiesTable.sortOrder), asc(citiesTable.id));
  res.json(rows);
});

router.post("/cities", requireAuth, requireRole(...ADMIN_ROLE), async (req: AuthenticatedRequest, res): Promise<void> => {
  const { code, name, shortName, sortOrder } = req.body;
  if (!code || !name || !shortName) { res.status(400).json({ error: "code, name, shortName are required" }); return; }
  const [existing] = await db.select().from(citiesTable).where(eq(citiesTable.code, code));
  if (existing) { res.status(409).json({ error: "City code already exists" }); return; }
  const [row] = await db.insert(citiesTable).values({ code, name, shortName, sortOrder: sortOrder ?? 0 }).returning();
  await logAudit({ action: "city.created", actorId: req.user!.userId, targetType: "city", targetId: row.id });
  res.status(201).json(row);
});

router.patch("/cities/:cityId", requireAuth, requireRole(...ADMIN_ROLE), async (req: AuthenticatedRequest, res): Promise<void> => {
  const cityId = parseId(req.params.cityId);
  const [city] = await db.select().from(citiesTable).where(eq(citiesTable.id, cityId));
  if (!city) { res.status(404).json({ error: "Not found" }); return; }
  const { name, shortName, enabled, sortOrder } = req.body;

  // Cannot disable a city that still has projects.
  if (enabled === false && city.enabled) {
    const [inUse] = await db.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.cityId, cityId)).limit(1);
    if (inUse) { res.status(409).json({ error: "Cannot disable a city with active projects", code: "CITY_IN_USE" }); return; }
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (shortName !== undefined) updates.shortName = shortName;
  if (enabled !== undefined) updates.enabled = enabled;
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  const [row] = await db.update(citiesTable).set(updates).where(eq(citiesTable.id, cityId)).returning();
  await logAudit({ action: "city.updated", actorId: req.user!.userId, targetType: "city", targetId: cityId });
  res.json(row);
});

router.delete("/cities/:cityId", requireAuth, requireRole(...ADMIN_ROLE), async (req: AuthenticatedRequest, res): Promise<void> => {
  const cityId = parseId(req.params.cityId);
  const [inUse] = await db.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.cityId, cityId)).limit(1);
  if (inUse) { res.status(409).json({ error: "Cannot delete a city with active projects", code: "CITY_IN_USE" }); return; }
  await db.delete(citiesTable).where(eq(citiesTable.id, cityId));
  await logAudit({ action: "city.deleted", actorId: req.user!.userId, targetType: "city", targetId: cityId });
  res.sendStatus(204);
});

export default router;
```

- [ ] **Step 2: Register the router.** In `artifacts/api-server/src/routes/index.ts`, import and mount it the same way existing routers are mounted (read the file first to match the exact pattern, e.g. `import citiesRouter from "./cities";` then `router.use(citiesRouter);`).

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/cities.ts artifacts/api-server/src/routes/index.ts
git commit -m "feat(api): cities list + admin CRUD with in-use guard"
```

### Task 6: Project Categories route (list + admin CRUD with in-use guard)

**Files:**
- Create: `artifacts/api-server/src/routes/categories.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

- [ ] **Step 1: Create `categories.ts`** — identical structure to `cities.ts`, swapping the table and the in-use column (`projectsTable.categoryId`) and audit action prefix `category.*`. Routes: `GET /project-categories`, `POST /project-categories`, `PATCH /project-categories/:categoryId`, `DELETE /project-categories/:categoryId`. The POST body is `{ code, name, sortOrder }`; PATCH body is `{ name, enabled, sortOrder }`. In-use guard error code `CATEGORY_IN_USE`.

```ts
import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { projectCategoriesTable, projectsTable } from "@workspace/db";
import { requireAuth, requireRole, type AuthenticatedRequest, ADMIN_ROLE } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { parseId } from "../lib/http";

const router: IRouter = Router();

router.get("/project-categories", requireAuth, async (_req: AuthenticatedRequest, res): Promise<void> => {
  const rows = await db.select().from(projectCategoriesTable).orderBy(asc(projectCategoriesTable.sortOrder), asc(projectCategoriesTable.id));
  res.json(rows);
});

router.post("/project-categories", requireAuth, requireRole(...ADMIN_ROLE), async (req: AuthenticatedRequest, res): Promise<void> => {
  const { code, name, sortOrder } = req.body;
  if (!code || !name) { res.status(400).json({ error: "code, name are required" }); return; }
  const [existing] = await db.select().from(projectCategoriesTable).where(eq(projectCategoriesTable.code, code));
  if (existing) { res.status(409).json({ error: "Category code already exists" }); return; }
  const [row] = await db.insert(projectCategoriesTable).values({ code, name, sortOrder: sortOrder ?? 0 }).returning();
  await logAudit({ action: "category.created", actorId: req.user!.userId, targetType: "category", targetId: row.id });
  res.status(201).json(row);
});

router.patch("/project-categories/:categoryId", requireAuth, requireRole(...ADMIN_ROLE), async (req: AuthenticatedRequest, res): Promise<void> => {
  const categoryId = parseId(req.params.categoryId);
  const [cat] = await db.select().from(projectCategoriesTable).where(eq(projectCategoriesTable.id, categoryId));
  if (!cat) { res.status(404).json({ error: "Not found" }); return; }
  const { name, enabled, sortOrder } = req.body;
  if (enabled === false && cat.enabled) {
    const [inUse] = await db.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.categoryId, categoryId)).limit(1);
    if (inUse) { res.status(409).json({ error: "Cannot disable a category in use", code: "CATEGORY_IN_USE" }); return; }
  }
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (enabled !== undefined) updates.enabled = enabled;
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  const [row] = await db.update(projectCategoriesTable).set(updates).where(eq(projectCategoriesTable.id, categoryId)).returning();
  await logAudit({ action: "category.updated", actorId: req.user!.userId, targetType: "category", targetId: categoryId });
  res.json(row);
});

router.delete("/project-categories/:categoryId", requireAuth, requireRole(...ADMIN_ROLE), async (req: AuthenticatedRequest, res): Promise<void> => {
  const categoryId = parseId(req.params.categoryId);
  const [inUse] = await db.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.categoryId, categoryId)).limit(1);
  if (inUse) { res.status(409).json({ error: "Cannot delete a category in use", code: "CATEGORY_IN_USE" }); return; }
  await db.delete(projectCategoriesTable).where(eq(projectCategoriesTable.id, categoryId));
  await logAudit({ action: "category.deleted", actorId: req.user!.userId, targetType: "category", targetId: categoryId });
  res.sendStatus(204);
});

export default router;
```

- [ ] **Step 2: Register the router** in `routes/index.ts` (same pattern as Task 5 Step 2).

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/categories.ts artifacts/api-server/src/routes/index.ts
git commit -m "feat(api): project-categories list + admin CRUD with in-use guard"
```

### Task 7: PM city-assignment endpoints

**Files:**
- Modify: `artifacts/api-server/src/routes/users.ts`

Read `users.ts` first to match its style. Add two admin-only endpoints scoped to a user id.

- [ ] **Step 1: Add imports** (extend existing imports as needed):

```ts
import { userCitiesTable, citiesTable } from "@workspace/db";
import { ADMIN_ROLE } from "../middlewares/requireAuth";
```

- [ ] **Step 2: GET assigned cities for a user**

```ts
router.get("/users/:userId/cities", requireAuth, requireRole(...ADMIN_ROLE), async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = parseId(req.params.userId);
  const rows = await db.select({ cityId: userCitiesTable.cityId }).from(userCitiesTable).where(eq(userCitiesTable.userId, userId));
  res.json(rows.map((r) => r.cityId));
});
```

- [ ] **Step 3: PUT (replace) assigned cities for a project-manager**

```ts
router.put("/users/:userId/cities", requireAuth, requireRole(...ADMIN_ROLE), async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = parseId(req.params.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.role !== "project-manager") { res.status(400).json({ error: "City assignment applies to project managers only" }); return; }

  const cityIds: unknown = req.body?.cityIds;
  if (!Array.isArray(cityIds) || cityIds.some((id) => typeof id !== "number")) {
    res.status(400).json({ error: "cityIds must be an array of numbers" }); return;
  }
  // Validate all city ids exist.
  for (const id of cityIds) {
    const [c] = await db.select({ id: citiesTable.id }).from(citiesTable).where(eq(citiesTable.id, id));
    if (!c) { res.status(400).json({ error: `Unknown city id ${id}` }); return; }
  }
  await db.delete(userCitiesTable).where(eq(userCitiesTable.userId, userId));
  if (cityIds.length) await db.insert(userCitiesTable).values(cityIds.map((cityId) => ({ userId, cityId })));
  await logAudit({ action: "user.cities-updated", actorId: req.user!.userId, targetType: "user", targetId: userId });
  res.json(cityIds);
});
```

Confirm `usersTable`, `requireRole`, `logAudit`, `parseId`, `eq` are imported in `users.ts` (add any missing).

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/users.ts
git commit -m "feat(api): admin endpoints to get/set a PM's assigned cities"
```

---

## Phase 4 — Backend: project city scoping + category

### Task 8: enrichProject includes city + category; scope project list/read/create/update

**Files:**
- Modify: `artifacts/api-server/src/routes/projects.ts`

Read the current `projects.ts` (already summarized in the spec exploration). Apply these changes:

- [ ] **Step 1: Imports** — extend the `@workspace/db` import with `citiesTable, projectCategoriesTable` and the middleware import with `CITY_SCOPED_ROLES, getAssignedCityIds`. Also add `inArray` to the `drizzle-orm` import.

- [ ] **Step 2: enrichProject — attach `city` and `category`.** Inside `enrichProject`, after `pipelineName` resolution, add:

```ts
  let city = null;
  const [c] = await db.select().from(citiesTable).where(eq(citiesTable.id, project.cityId));
  city = c ?? null;

  let category = null;
  const [cat] = await db.select().from(projectCategoriesTable).where(eq(projectCategoriesTable.id, project.categoryId));
  category = cat ?? null;
```

and add `city, category,` to the returned object.

- [ ] **Step 3: GET /projects — scope PMs and support `?cityId`.** Replace the privileged branch (currently `const rows = ... ` based on `sector`) with city-aware logic:

```ts
  const { search, status, stage, cityId: cityIdParam } = req.query as Record<string, string>;
  // ... existing userId/role/isPrivileged/thresholds ...

  // Investor branch stays as-is (own projects).

  // Privileged branch:
  const conditions = [];
  const isCityScoped = (CITY_SCOPED_ROLES as readonly string[]).includes(role);
  if (isCityScoped) {
    const assigned = await getAssignedCityIds(userId);
    if (assigned.length === 0) { res.json([]); return; }
    conditions.push(inArray(projectsTable.cityId, assigned));
  }
  if (cityIdParam) {
    const requested = Number(cityIdParam);
    // A scoped PM may only filter within assigned cities; ignore out-of-scope requests.
    conditions.push(eq(projectsTable.cityId, requested));
  }
  const rows = conditions.length
    ? await db.select().from(projectsTable).where(and(...conditions))
    : await db.select().from(projectsTable);
```

Remove the old `sector` filter line. In the `search` filter, replace `p.sector.toLowerCase().includes(s)` with `(p.category?.name ?? "").toLowerCase().includes(s)`.

- [ ] **Step 4: POST /projects — require city + category, enforce PM city.** Replace the destructure/validation:

```ts
  const { name, cityId, categoryId, agreementNumber, plotNumber, pipelineId: rawPipelineId, constructionPct, investorId, notes } = req.body;
  if (!name || !cityId || !categoryId || !agreementNumber) {
    res.status(400).json({ error: "name, cityId, categoryId, agreementNumber are required" }); return;
  }
  // Validate FKs.
  const [cityRow] = await db.select().from(citiesTable).where(eq(citiesTable.id, cityId));
  if (!cityRow) { res.status(400).json({ error: "Unknown city" }); return; }
  const [catRow] = await db.select().from(projectCategoriesTable).where(eq(projectCategoriesTable.id, categoryId));
  if (!catRow) { res.status(400).json({ error: "Unknown category" }); return; }
  // PM may only create in assigned cities.
  if ((CITY_SCOPED_ROLES as readonly string[]).includes(req.user!.role)) {
    const assigned = await getAssignedCityIds(req.user!.userId);
    if (!assigned.includes(cityId)) { res.status(403).json({ error: "Forbidden: city not assigned to you" }); return; }
  }
```

In the `db.insert(projectsTable).values({...})`, replace `sector` with `cityId, categoryId`.

- [ ] **Step 5: GET /projects/:projectId — 403 for PM outside assigned city.** After loading the project and computing `isPrivileged`, add a city-scope check before returning:

```ts
  if ((CITY_SCOPED_ROLES as readonly string[]).includes(role)) {
    const assigned = await getAssignedCityIds(req.user!.userId);
    if (!assigned.includes(project.cityId)) { res.status(403).json({ error: "Forbidden" }); return; }
  }
```

- [ ] **Step 6: PATCH /projects/:projectId — enforce city on access and on move; allow categoryId.** After loading the project, add the same PM city-scope guard as Step 5 (using the project's current `cityId`). In the destructure add `cityId` and `categoryId`. When `cityId` is being changed, validate it exists and, for a scoped PM, is in their assigned set (else 403). In the `updates` object add:

```ts
  if (cityId !== undefined) {
    const [cr] = await db.select().from(citiesTable).where(eq(citiesTable.id, cityId));
    if (!cr) { res.status(400).json({ error: "Unknown city" }); return; }
    if ((CITY_SCOPED_ROLES as readonly string[]).includes(req.user!.role)) {
      const assigned = await getAssignedCityIds(req.user!.userId);
      if (!assigned.includes(cityId)) { res.status(403).json({ error: "Forbidden: city not assigned to you" }); return; }
    }
    updates.cityId = cityId;
  }
  if (categoryId !== undefined) {
    const [cr] = await db.select().from(projectCategoriesTable).where(eq(projectCategoriesTable.id, categoryId));
    if (!cr) { res.status(400).json({ error: "Unknown category" }); return; }
    updates.categoryId = categoryId;
  }
```

Remove the old `if (sector !== undefined) updates.sector = sector;` line.

- [ ] **Step 7: GET /projects/export — replace sector column.** The header array uses `"Sector"`; change to `"City"` and `"Category"`. In the row mapping replace `p.sector` with `(p.city?.shortName ?? "")` and add `(p.category?.name ?? "")` in the matching position. Also apply the PM city scope: build `rows` the same way as Step 3 (export should respect scope) — for an assigned-cities PM, filter `inArray(projectsTable.cityId, assigned)`.

- [ ] **Step 8: Commit**

```bash
git add artifacts/api-server/src/routes/projects.ts
git commit -m "feat(api): scope projects by PM cities; require/return city + category"
```

---

## Phase 5 — API spec + client codegen

### Task 9: Extend OpenAPI spec and regenerate client

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Generated (do not hand-edit): `lib/api-client-react/src/generated/**`, `lib/api-zod/src/generated/**`

Read the relevant parts of `openapi.yaml` first: the `Project` schema, the `/projects` path (params + request bodies), and an existing simple CRUD path to copy the style.

- [ ] **Step 1: Add `City` and `ProjectCategory` component schemas** under `components.schemas`:

```yaml
    City:
      type: object
      required: [id, code, name, shortName, enabled, sortOrder]
      properties:
        id: { type: integer }
        code: { type: string }
        name: { type: string }
        shortName: { type: string }
        enabled: { type: boolean }
        sortOrder: { type: integer }
    ProjectCategory:
      type: object
      required: [id, code, name, enabled, sortOrder]
      properties:
        id: { type: integer }
        code: { type: string }
        name: { type: string }
        enabled: { type: boolean }
        sortOrder: { type: integer }
```

- [ ] **Step 2: Update the `Project` schema** — remove the `sector` property; add:

```yaml
        cityId: { type: integer }
        categoryId: { type: integer }
        city: { $ref: '#/components/schemas/City' }
        category: { $ref: '#/components/schemas/ProjectCategory' }
```

(Mark `city`/`category` as not required since investors/edge rows may omit; keep `cityId`/`categoryId` required.)

- [ ] **Step 3: Update `/projects` GET params and POST/PATCH bodies** — add a `cityId` query param to GET; in the create/update request bodies remove `sector` and add `cityId` and `categoryId` (required on create).

- [ ] **Step 4: Add the new paths** — `/cities` (get, post), `/cities/{cityId}` (patch, delete), `/project-categories` (get, post), `/project-categories/{categoryId}` (patch, delete), `/users/{userId}/cities` (get, put). Follow the exact request/response shapes implemented in Tasks 5–7. Use `operationId`s that yield clean hook names (e.g. `getCities`, `createCity`, `updateCity`, `deleteCity`, `getProjectCategories`, `createProjectCategory`, `updateProjectCategory`, `deleteProjectCategory`, `getUserCities`, `setUserCities`).

- [ ] **Step 5: Regenerate the client + types**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: orval writes `api-client-react` + `api-zod` generated files and `typecheck:libs` passes. New hooks (`useGetCities`, `useCreateCity`, …) now exist in `@workspace/api-client-react`.

- [ ] **Step 6: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-client-react/src/generated lib/api-zod/src/generated
git commit -m "feat(api-spec): add cities, categories, user-cities; project city/category; regen client"
```

---

## Phase 6 — Frontend

> All frontend tasks: read the target file first to match its existing imports, query patterns (TanStack Query hooks from `@workspace/api-client-react`), and shadcn/ui component usage. Verification for this phase is deferred to Task 16 (rebuild + typecheck + screenshot).

### Task 10: City context + header switcher (URL-persisted)

**Files:**
- Create: `artifacts/jabeen-portal/src/hooks/use-city-filter.tsx`
- Create: `artifacts/jabeen-portal/src/components/city-switcher.tsx`
- Modify: the app header/layout component that renders the top bar (find it: `grep -rl "jabeen-logo\|<header" artifacts/jabeen-portal/src` excluding login)

- [ ] **Step 1: `use-city-filter.tsx`** — a hook that reads/writes the `?city=<CODE>` query param via Wouter and exposes the selectable cities for the current user.

```tsx
import { useSearch, useLocation } from "wouter";
import { useGetCities } from "@workspace/api-client-react";
import { useAuth } from "./use-auth";

// Returns { cities, activeCode, setActiveCode, activeCityId }
export function useCityFilter() {
  const search = useSearch();
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: allCities = [] } = useGetCities();

  // PMs only see their assigned cities; others see all enabled cities.
  // (PM assigned-city list comes from the projects they can see; for the switcher
  //  we filter to enabled cities and the API already scopes results, so showing all
  //  enabled cities to a PM is acceptable — selecting an unassigned city simply
  //  returns an empty list. If strict hiding is desired, fetch /users/{id}/cities.)
  const cities = allCities.filter((c) => c.enabled);

  const params = new URLSearchParams(search);
  const activeCode = params.get("city") ?? "ALL";
  const activeCityId = cities.find((c) => c.code === activeCode)?.id ?? null;

  const setActiveCode = (code: string) => {
    const next = new URLSearchParams(search);
    if (code === "ALL") next.delete("city"); else next.set("city", code);
    const qs = next.toString();
    setLocation(`${location}${qs ? `?${qs}` : ""}`);
  };

  return { cities, activeCode, setActiveCode, activeCityId };
}
```

> Note: if the team wants PMs to see *only* assigned cities in the switcher, add a `useGetUserCities(user.id)` call gated on `user.role === "project-manager"` and intersect. Keep the simpler version unless asked.

- [ ] **Step 2: `city-switcher.tsx`** — a shadcn `Select` bound to the hook. Options: "All cities" (value `ALL`) + each city's `shortName`. Render nothing if `cities.length <= 1`.

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCityFilter } from "@/hooks/use-city-filter";

export function CitySwitcher() {
  const { cities, activeCode, setActiveCode } = useCityFilter();
  if (cities.length <= 1) return null;
  return (
    <Select value={activeCode} onValueChange={setActiveCode}>
      <SelectTrigger className="w-[200px]" data-testid="city-switcher">
        <SelectValue placeholder="All cities" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">All cities</SelectItem>
        {cities.map((c) => (
          <SelectItem key={c.id} value={c.code}>{c.shortName}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 3: Mount `<CitySwitcher />`** in the top bar/header component next to the existing controls.

- [ ] **Step 4: Commit**

```bash
git add artifacts/jabeen-portal/src/hooks/use-city-filter.tsx artifacts/jabeen-portal/src/components/city-switcher.tsx
git add -A artifacts/jabeen-portal/src
git commit -m "feat(web): city context hook + header city switcher (URL-persisted)"
```

### Task 11: Dashboard — city/category in list, create form, filter, copy

**Files:**
- Modify: `artifacts/jabeen-portal/src/pages/dashboard/dashboard.tsx`

Read `dashboard.tsx` fully first. It contains the projects list, the "create project" form (with `sector`, `agreementNumber`, `plotNumber` inputs), and the subtitle.

- [ ] **Step 1: Pass the active city into the projects query.** Use `useCityFilter()` to get `activeCityId`; pass `{ cityId: activeCityId ?? undefined }` into the existing `useGetProjects(...)` query params so the list respects the switcher.

- [ ] **Step 2: Replace the `sector` form field** with two required selects — **City** (from `useGetCities()`, enabled only) and **Project Category** (from `useGetProjectCategories()`, enabled only) — and submit `cityId` + `categoryId` instead of `sector`. Update the form's zod schema accordingly (`cityId: z.number()`, `categoryId: z.number()`, drop `sector`).

- [ ] **Step 3: Show a city badge and category badge** on each project row/card (use the existing `Badge` component; render `project.city?.shortName` and `project.category?.name`).

- [ ] **Step 4: Copy changes** in this file:
  - Subtitle (line ~349): `"Overview of all industrial projects in Jubail"` → `"Overview of all JABEEN projects across Royal Commission cities"`.
  - Plot placeholder (line ~190): `"e.g. Jubail-P-4217"` → `"e.g. P-4217"`.
  - Leave the agreement placeholder `"e.g. RCJY-2026-0042"` unchanged.
  - Empty state text (if any) → "No JABEEN projects {in <city>}".

- [ ] **Step 5: Commit**

```bash
git add artifacts/jabeen-portal/src/pages/dashboard/dashboard.tsx
git commit -m "feat(web): dashboard city/category selectors, badges, filter, copy"
```

### Task 12: Project detail + investor list show city/category

**Files:**
- Modify: `artifacts/jabeen-portal/src/pages/projects/tabs/overview-tab.tsx`
- Modify: `artifacts/jabeen-portal/src/pages/investor/my-projects.tsx`

- [ ] **Step 1: Overview tab** — read the file; wherever it shows `sector`, replace with the city (`project.city?.name`) and category (`project.category?.name`). If `sector` is shown in a definition list, add a "City" row and a "Project Category" row.

- [ ] **Step 2: My Projects** — add a city badge + category badge to each investor project card (same `Badge` pattern as the dashboard).

- [ ] **Step 3: Commit**

```bash
git add artifacts/jabeen-portal/src/pages/projects/tabs/overview-tab.tsx artifacts/jabeen-portal/src/pages/investor/my-projects.tsx
git commit -m "feat(web): show city + category on project detail and investor list"
```

### Task 13: Admin — Cities management screen

**Files:**
- Create: `artifacts/jabeen-portal/src/pages/admin/cities.tsx`
- Modify: the app router (find it: `grep -rl "Route\b" artifacts/jabeen-portal/src/App.tsx artifacts/jabeen-portal/src` ) and the admin nav/menu

Read `artifacts/jabeen-portal/src/pages/admin/users.tsx` to copy the page scaffold (table + dialog form + TanStack mutations + toasts + `data-testid`s).

- [ ] **Step 1: Build `cities.tsx`** — a table of cities (code, name, short name, enabled, sortOrder) with: an "Add city" dialog (`useCreateCity`), inline rename/sortOrder + enable/disable toggle (`useUpdateCity`), and delete (`useDeleteCity`) that surfaces the `CITY_IN_USE` 409 as a toast ("Cannot delete a city with active projects"). Gate the whole page to `administrator` (mirror how `users.tsx` gates).

- [ ] **Step 2: Add the route** (e.g. `/admin/cities`) and an admin-nav link "Cities".

- [ ] **Step 3: Commit**

```bash
git add artifacts/jabeen-portal/src/pages/admin/cities.tsx
git add -A artifacts/jabeen-portal/src
git commit -m "feat(web): admin Cities management screen"
```

### Task 14: Admin — Project Categories management screen

**Files:**
- Create: `artifacts/jabeen-portal/src/pages/admin/categories.tsx`
- Modify: app router + admin nav

- [ ] **Step 1: Build `categories.tsx`** — same scaffold as `cities.tsx`, using `useGetProjectCategories`/`useCreateProjectCategory`/`useUpdateProjectCategory`/`useDeleteProjectCategory`; columns code/name/enabled/sortOrder; surface `CATEGORY_IN_USE` 409 as a toast. Admin-gated.

- [ ] **Step 2: Add route** (`/admin/categories`) + admin-nav link "Project Categories".

- [ ] **Step 3: Commit**

```bash
git add artifacts/jabeen-portal/src/pages/admin/categories.tsx
git add -A artifacts/jabeen-portal/src
git commit -m "feat(web): admin Project Categories management screen"
```

### Task 15: Admin Users — PM city-assignment multi-select

**Files:**
- Modify: `artifacts/jabeen-portal/src/pages/admin/users.tsx`

- [ ] **Step 1:** In the user create/edit dialog, when the selected role is `project-manager`, render a multi-select of enabled cities (checkbox list using `useGetCities`). On save, after the user is created/updated, call `useSetUserCities(userId, { cityIds })`. Pre-populate from `useGetUserCities(userId)` when editing. Hide the control for non-PM roles.

- [ ] **Step 2: Commit**

```bash
git add artifacts/jabeen-portal/src/pages/admin/users.tsx
git commit -m "feat(web): assign cities to project managers in user editor"
```

### Task 16: Login copy + footer + headline; rebuild & verify the whole frontend

**Files:**
- Modify: `artifacts/jabeen-portal/src/pages/auth/login.tsx`

- [ ] **Step 1: Login copy edits:**
  - Footer: `"Royal Commission for Jubail and Yanbu"` → `"Jubail and Yanbu Industrial Cities Services Company (JABEEN)"`.
  - Headline: `"Industrial Project Lifecycle Tracking"` → `"JABEEN Project Lifecycle Tracking"` (keep the existing `<br className="hidden lg:block" />` split sensibly, e.g. "JABEEN Project" / "Lifecycle Tracking").
  - Sub-copy: `"The authoritative portal for Jubail Industrial City investors to track construction and operational milestones."` → `"The authoritative portal for investors to track all JABEEN projects across the Royal Commission's cities."`
  - Location chip: `"Jubail Industrial City"` → `"Royal Commission Industrial Cities"`.
  - Leave the hero image and footer-year as-is.

- [ ] **Step 2: Residual copy sweep.** Run:

```bash
grep -rniE "jubail|industrial project|projects in jubail" artifacts/jabeen-portal/src artifacts/api-server/src lib/db/src --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Resolve each remaining hit per the spec's sweep table (skip the `jubail-refinery.webp` filename and the kept agreement-number example). Also check `artifacts/jabeen-portal/index.html` `<title>`/meta and `replit.md`.

- [ ] **Step 3: Rebuild the stack with all changes**

Run: `docker compose -f .docker-run/docker-compose.yml down -v && docker compose -f .docker-run/docker-compose.yml up -d --build`
Expected: image builds; container seeds 4 cities, 5 categories, sample projects across cities, pm1→JUB/YNB; frontend serves on :5173.

- [ ] **Step 4: Verify frontend health.** Poll `http://localhost:5173/` (200) and `http://localhost:5173/api/cities` is reachable after login. Take a CDP login screenshot (reuse the approach from `.docker-run/cdp-shot.mjs`) and confirm new login copy renders.

- [ ] **Step 5: Commit**

```bash
git add artifacts/jabeen-portal/src/pages/auth/login.tsx
git add -A
git commit -m "feat(web): generalize login copy to JABEEN multi-city; copy sweep"
```

---

## Phase 7 — Integration tests & final verification

### Task 17: Extend the cross-role integration suite

**Files:**
- Modify: `.docker-run/test-suite.mjs`

Read `test-suite.mjs` first to match its assertion helpers, login/TOTP flow, and how it references seeded accounts (admin, pm1, tm1, an investor). Add a new section of assertions.

- [ ] **Step 1: Write the failing assertions** (they fail until the stack is rebuilt with all prior tasks). Add, using the suite's existing helpers:
  - pm1 (JUB+YNB) `GET /api/projects` returns only JUB/YNB projects; none from RAS/JZN.
  - pm1 `GET /api/projects/:id` for a RAS/JZN project → `403`.
  - pm1 `POST /api/projects` with a RAS `cityId` → `403`; with a JUB `cityId` → `201`.
  - admin and tm1 `GET /api/projects` include all four cities.
  - investor sees only own projects; each carries `city` and `category`.
  - `GET /api/cities` works for any authenticated role; `POST /api/cities` as pm1/investor → `403`, as admin → `201`.
  - `POST /api/project-categories` as non-admin → `403`, as admin → `201`.
  - Disable/delete a city that has projects → `409 CITY_IN_USE`; same for a category in use → `409 CATEGORY_IN_USE`.
  - `GET /api/projects?cityId=<JUB id>` as admin returns only JUB projects.
  - `POST /api/projects` missing `cityId` or `categoryId` → `400`.
  - Cleanup: any cities/categories created by the test are deleted at the end (and MFA reset per existing suite convention).

- [ ] **Step 2: Run the suite (expect failures first if run before rebuild, then pass after)**

Run: `node .docker-run/test-suite.mjs`
Expected after a full rebuild: all assertions pass; suite prints its existing summary plus the new city/category cases.

- [ ] **Step 3: Commit**

```bash
git add .docker-run/test-suite.mjs
git commit -m "test: cross-role assertions for city scoping + city/category CRUD"
```

### Task 18: Full verification pass

- [ ] **Step 1: Clean rebuild + seed**

Run: `docker compose -f .docker-run/docker-compose.yml down -v && docker compose -f .docker-run/docker-compose.yml up -d --build`

- [ ] **Step 2: Run the full integration suite**

Run: `node .docker-run/test-suite.mjs`
Expected: 0 failures.

- [ ] **Step 3: Manual UI smoke via CDP screenshots** (reuse `.docker-run/cdp-shot.mjs` pattern):
  - Login as admin → dashboard shows the city switcher; switching to "Jubail" filters the list and updates `?city=JUB`.
  - Create a project requires City + Category; the new project shows both badges.
  - `/admin/cities` and `/admin/categories` load; add + disable + delete-in-use behaves (toast on 409).
  - User editor shows the city multi-select only for project-manager.
  - Login as pm1 → only JUB/YNB projects visible; switcher limited/empty for other cities.

- [ ] **Step 4: Typecheck**

Run (in container or via compose exec): `pnpm -w run typecheck:libs` and the api-server typecheck per the repo gotcha (`pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck`).
Expected: clean.

- [ ] **Step 5: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore: multi-city portal verification cleanup"
```

---

## Self-Review

**Spec coverage:**
- City attribute + scoped access → Tasks 1, 2, 4, 8 (schema, scope helper, project scoping).
- Only PMs scoped; admins/top-mgmt global → Task 8 (`CITY_SCOPED_ROLES = ["project-manager"]`), Task 4.
- PM multi-city assignment → Tasks 1 (`user_cities`), 3 (seed pm1→JUB/YNB), 7 (assignment API), 15 (UI).
- Admin-managed cities CRUD → Tasks 5, 13.
- Project Category replaces `sector`, admin CRUD, not scoped → Tasks 2, 6, 8, 11, 14.
- Header city switcher, URL-persisted → Task 10.
- City/category selectors + badges → Tasks 11, 12.
- Branding/copy sweep (footer, headline, sub-copy, chip, subtitle, placeholders, template desc) → Tasks 3 (template desc), 11 (dashboard), 16 (login + grep sweep).
- Migration/seed (4 cities, starter categories, backfill JUB, pm1 multi-city) → Tasks 2, 3, 16 Step 3.
- Testing (all spec bullets) → Task 17.
- Out-of-scope items remain untouched (no per-city theming/pipelines, imagery kept).

**Placeholder scan:** No "TBD/TODO"; frontend tasks that depend on existing JSX include a "read the file first" instruction plus the exact code/strings to add or change, because the existing markup can't be reproduced blind. Backend/schema/seed/spec/test steps contain complete code.

**Type consistency:** Field names consistent across tasks — `cityId`, `categoryId`, `shortName`, `enabled`, `sortOrder`; helpers `getAssignedCityIds`, `CITY_SCOPED_ROLES`; hook names match the `operationId`s in Task 9 (`useGetCities`, `useCreateCity`, `useUpdateCity`, `useDeleteCity`, `useGetProjectCategories`, `useCreateProjectCategory`, `useUpdateProjectCategory`, `useDeleteProjectCategory`, `useGetUserCities`, `useSetUserCities`). Error codes `CITY_IN_USE`/`CATEGORY_IN_USE` consistent between routes (5/6) and tests (17).

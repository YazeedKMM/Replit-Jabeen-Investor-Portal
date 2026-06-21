# Multi-City Portal & Configurable Project Categories — Design

**Date:** 2026-06-21
**Status:** Approved (pending spec review)

## Summary

The JABEEN portal currently assumes a single city (Jubail) implicitly: there is no
city concept in the data model, and "Jubail"/"industrial" appear hard-coded in
branding, copy, and seed data. This change makes the portal serve **all four Royal
Commission cities** operated by JABEEN, introduces **city-scoped access for Project
Managers**, replaces the free-text `sector` field with an **admin-managed Project
Category**, and generalizes "industrial project" copy to "JABEEN projects" (the
portal serves projects of any type — industrial, commercial, entertainment, etc.).

JABEEN = **Jubail and Yanbu Industrial Cities Services Company**, the operating
company; the portal tracks all JABEEN-managed projects across the cities.

### The four cities

| code | name | shortName |
|------|------|-----------|
| JUB | Jubail Industrial City | Jubail |
| YNB | Yanbu Industrial City | Yanbu |
| RAS | Ras Al-Khair City for Mining Industries | Ras Al-Khair |
| JZN | Jazan City for Primary and Downstream Industries | Jazan |

## Decisions (locked)

- **City is a real attribute + access dimension** (not just branding).
- **Only Project Managers are city-scoped.** Administrators and Top-Management are
  global (see all cities). Investors see only their own projects (unchanged), which
  may span cities.
- **A PM can be assigned to one or more cities** and sees the union of projects across
  all assigned cities.
- **Cities are admin-managed (CRUD).**
- **Project Category** replaces the free-text `sector` field, is admin-managed (CRUD),
  and is **not** access-scoped (only cities gate visibility).
- **Navigation = global city switcher** (header), persisted in the URL.

## Data Model

New and changed tables (Drizzle / Postgres):

### `cities`
- `id` serial PK
- `code` text unique — `JUB` | `YNB` | `RAS` | `JZN`
- `name` text — full name (e.g. "Jubail Industrial City")
- `shortName` text — display short form (e.g. "Jubail")
- `enabled` boolean, default true
- `sortOrder` integer, default 0
- `createdAt` timestamptz, default now

### `project_categories`
- `id` serial PK
- `code` text unique
- `name` text — e.g. "Petrochemical"
- `enabled` boolean, default true
- `sortOrder` integer, default 0
- `createdAt` timestamptz, default now

### `user_cities` (PM ↔ city assignment, many-to-many)
- `userId` integer FK → users(id) on delete cascade
- `cityId` integer FK → cities(id) on delete cascade
- composite PK (`userId`, `cityId`)
- Only meaningful for `project-manager` users. Ignored for admin/top-management
  (they are global) and investors.

### `projects` (changed)
- `+ cityId` integer FK → cities(id), **NOT NULL** (after backfill)
- `+ categoryId` integer FK → project_categories(id), **NOT NULL** (after backfill)
- `- sector` text — **removed** (migrated into `project_categories`)

## Access Control (API)

Visibility and mutation rules by role:

| Role | Project visibility | City assignment | City/Category CRUD |
|------|--------------------|-----------------|--------------------|
| administrator | all cities | n/a (global) | yes |
| top-management | all cities | n/a (global) | no |
| project-manager | only projects whose `cityId` ∈ assigned cities | required | no |
| investor | only own projects (any city) | n/a | no |

- **Project list/read**: PM queries are filtered to assigned `cityId`s; admin/top-mgmt
  unfiltered; investor restricted to own (existing behavior). The active header city
  narrows further via `?cityId=` query param.
- **Project create/update**: `cityId` and `categoryId` are required. A PM may only
  create or move a project within assigned cities, else `403`. Admin/top-mgmt: any
  city. A PM accessing a project outside their cities by direct ID returns `403`.
- **Cities CRUD** (admin only): create, rename, enable/disable. Disable is soft
  (`enabled=false`). A city with active projects **cannot** be disabled or deleted —
  it must be empty first. Non-admins receive `403`.
- **Project Categories CRUD** (admin only): create, rename, enable/disable. A category
  in use by any project **cannot** be disabled or deleted. Non-admins `403`.
- **PM city-assignment** (admin only): set the list of cities for a project-manager
  (multi-select replaces that user's `user_cities` rows).

## Frontend / UX

- **Header city switcher** (global city context):
  - Global users (admin/top-mgmt) default to **"All cities"** and may narrow to one.
  - PMs see only their assigned cities; when assigned 2+, they also get **"All my
    cities"**. A PM with a single city sees a locked label.
  - Selection persists in the URL (`?city=JUB`) — shareable, survives reload, and
    satisfies the "URL reflects state" guideline.
- **Project create/edit**: required **City** selector (options limited to what the
  user may assign) and required **Project Category** selector.
- **Dashboard & lists**: a **city badge** and **category badge** on each project
  row/card; counts and subtitle reflect the active city. Empty states are city-aware
  ("No JABEEN projects in {city}").
- **Project detail**: shows city and category.
- **Admin screens**:
  - **Cities** management (list / add / rename / enable-disable).
  - **Project Categories** management (same pattern).
  - **User editor**: a **city-assignment multi-select** shown for project-manager users.
- **Investor "My Projects"**: city + category badge per project (no filter needed
  unless the list is large).

## Branding / Copy / Label Sweep

| Location | Now | Change |
|----------|-----|--------|
| `login.tsx` footer | "Royal Commission for Jubail and Yanbu" | "Jubail and Yanbu Industrial Cities Services Company (JABEEN)" |
| `login.tsx` headline | "Industrial Project Lifecycle Tracking" | "JABEEN Project Lifecycle Tracking" |
| `login.tsx` sub-copy | "…for Jubail Industrial City investors…" | "…track all JABEEN projects across the Royal Commission's cities…" |
| `login.tsx` location chip | "Jubail Industrial City" | "Royal Commission Industrial Cities" (or drop) |
| `login.tsx` hero image | `jubail-refinery.webp` | keep for now; rotating/neutral imagery is a follow-up |
| `dashboard.tsx` subtitle | "…all industrial projects in Jubail" | "…all JABEEN projects across Royal Commission cities" / active city |
| `dashboard.tsx` plot placeholder | "e.g. Jubail-P-4217" | "e.g. P-4217" |
| `dashboard.tsx` agreement placeholder | "e.g. RCJY-2026-0042" | keep (RCJY-wide) |
| `seed.ts` template description | "…for Jubail Industrial City…" | "…across Royal Commission industrial cities…" |
| New UI labels | — | "City", "Project Category", "All cities", "All my cities", city/category names |

During implementation, run an exhaustive grep for `Jubail`, `Yanbu`, `industrial`,
and `industrial project` across all source, plus `index.html` `<title>`/meta and
`replit.md`, to catch anything not enumerated above.

## Migration & Seed

Drizzle migration:
1. Create `cities`, `project_categories`, `user_cities`.
2. Add `projects.cityId` and `projects.categoryId` as **nullable**.
3. Seed the four cities and the starter categories.
4. Backfill: set every existing project's `cityId` → **JUB**; map each distinct
   existing `sector` string to a category (create one if unmapped) and set
   `categoryId`.
5. Set `cityId` and `categoryId` **NOT NULL**; drop the `sector` column.

Seed (idempotent, matching existing upsert style):
- **Cities**: the four above.
- **Starter categories**: Petrochemical, Oil & Gas, Mining, Commercial, Entertainment.
- **Sample data**: distribute sample projects across the four cities and assign
  categories; assign sample PM `pm1` to **JUB + YNB** (demonstrates multi-city
  scoping) and a second PM to a single city.

## Testing

Extend the cross-role integration suite (`.docker-run/test-suite.mjs`):
- PM assigned JUB+YNB sees only JUB/YNB projects; `403` on read/update/delete/create
  outside assigned cities (including direct-ID access).
- Admin and Top-Management see all cities.
- Investor sees own projects across cities; city is displayed.
- Cities CRUD is admin-only; non-admins `403`.
- Project Categories CRUD is admin-only; non-admins `403`.
- A city with active projects cannot be disabled or deleted.
- A category in use cannot be disabled or deleted.
- `?cityId=` filter narrows results correctly.
- Project create requires both `cityId` and `categoryId`.

## Out of Scope (YAGNI)

- Per-city theming, pipelines, or settings (the heavier multi-tenant option, declined).
- Rotating per-city login imagery.
- City-level analytics dashboards beyond the city filter.
- Arabic localization of city/category names.

These are notable follow-ups, none required for this change.

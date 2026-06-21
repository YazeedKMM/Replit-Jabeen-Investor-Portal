import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { citiesTable, projectsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, ADMIN_ROLE } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { parseId } from "../lib/http";

const router: IRouter = Router();

// Any authenticated user can read the city list (needed for selectors/switcher).
router.get("/cities", requireAuth, async (_req: AuthenticatedRequest, res): Promise<void> => {
  const rows = await db.select().from(citiesTable).orderBy(asc(citiesTable.sortOrder), asc(citiesTable.id));
  res.json(rows);
});

router.post("/cities", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const { code, name, shortName, sortOrder } = req.body;
  if (!code || !name || !shortName) { res.status(400).json({ error: "code, name, shortName are required" }); return; }
  const [existing] = await db.select().from(citiesTable).where(eq(citiesTable.code, code));
  if (existing) { res.status(409).json({ error: "City code already exists" }); return; }
  const [row] = await db.insert(citiesTable).values({ code, name, shortName, sortOrder: sortOrder ?? 0 }).returning();
  await logAudit({ action: "city.created", actorId: req.user!.userId, targetType: "city", targetId: row.id });
  res.status(201).json(row);
});

router.patch("/cities/:cityId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
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

router.delete("/cities/:cityId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const cityId = parseId(req.params.cityId);
  const [inUse] = await db.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.cityId, cityId)).limit(1);
  if (inUse) { res.status(409).json({ error: "Cannot delete a city with active projects", code: "CITY_IN_USE" }); return; }
  await db.delete(citiesTable).where(eq(citiesTable.id, cityId));
  await logAudit({ action: "city.deleted", actorId: req.user!.userId, targetType: "city", targetId: cityId });
  res.sendStatus(204);
});

export default router;

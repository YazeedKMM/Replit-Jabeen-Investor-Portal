import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { projectCategoriesTable, projectsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, ADMIN_ROLE } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { parseId } from "../lib/http";

const router: IRouter = Router();

router.get("/project-categories", requireAuth, async (_req: AuthenticatedRequest, res): Promise<void> => {
  const rows = await db.select().from(projectCategoriesTable).orderBy(asc(projectCategoriesTable.sortOrder), asc(projectCategoriesTable.id));
  res.json(rows);
});

router.post("/project-categories", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const { code, name, sortOrder } = req.body;
  if (!code || !name) { res.status(400).json({ error: "code, name are required" }); return; }
  const [existing] = await db.select().from(projectCategoriesTable).where(eq(projectCategoriesTable.code, code));
  if (existing) { res.status(409).json({ error: "Category code already exists" }); return; }
  const [row] = await db.insert(projectCategoriesTable).values({ code, name, sortOrder: sortOrder ?? 0 }).returning();
  await logAudit({ action: "category.created", actorId: req.user!.userId, targetType: "category", targetId: row.id });
  res.status(201).json(row);
});

router.patch("/project-categories/:categoryId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
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

router.delete("/project-categories/:categoryId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const categoryId = parseId(req.params.categoryId);
  const [inUse] = await db.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.categoryId, categoryId)).limit(1);
  if (inUse) { res.status(409).json({ error: "Cannot delete a category in use", code: "CATEGORY_IN_USE" }); return; }
  await db.delete(projectCategoriesTable).where(eq(projectCategoriesTable.id, categoryId));
  await logAudit({ action: "category.deleted", actorId: req.user!.userId, targetType: "category", targetId: categoryId });
  res.sendStatus(204);
});

export default router;

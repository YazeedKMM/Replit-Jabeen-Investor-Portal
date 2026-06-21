import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { projectsTable, citiesTable, projectCategoriesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, PRIVILEGED_ROLES } from "../middlewares/requireAuth";
import { deriveProjectStatus } from "../lib/status";
import { getStatusThresholds } from "../lib/settings-cache";

const router: IRouter = Router();

router.get("/dashboard", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(PRIVILEGED_ROLES as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [{ stalledDays, delayedDays }, projects, cities, categories] = await Promise.all([
    getStatusThresholds(),
    db.select().from(projectsTable),
    db.select().from(citiesTable),
    db.select().from(projectCategoriesTable),
  ]);
  const cityNameById = new Map(cities.map((c) => [c.id, c.shortName]));
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const statuses = await Promise.all(projects.map(async (p) => {
    const status = await deriveProjectStatus(p, stalledDays, delayedDays);
    return { project: p, status };
  }));

  const total = projects.length;
  const complete = statuses.filter((s) => s.status === "complete").length;
  const inProgress = statuses.filter((s) => s.status === "on-track" || s.status === "delayed").length;
  const needsAttention = statuses.filter((s) => s.status === "stalled" || s.project.attentionFlag).length;

  const byStatusMap: Record<string, number> = {};
  for (const s of statuses) {
    byStatusMap[s.status] = (byStatusMap[s.status] ?? 0) + 1;
  }
  const byStatus = Object.entries(byStatusMap).map(([status, count]) => ({ status, count }));

  const byCategoryMap: Record<string, number> = {};
  for (const p of projects) {
    const name = categoryNameById.get(p.categoryId) ?? "Unknown";
    byCategoryMap[name] = (byCategoryMap[name] ?? 0) + 1;
  }
  const byCategory = Object.entries(byCategoryMap).map(([category, count]) => ({ category, count }));

  const byCityMap: Record<string, number> = {};
  for (const p of projects) {
    const name = cityNameById.get(p.cityId) ?? "Unknown";
    byCityMap[name] = (byCityMap[name] ?? 0) + 1;
  }
  const byCity = Object.entries(byCityMap).map(([city, count]) => ({ city, count }));

  const recentUpdates = statuses
    .filter((s) => s.project.lastUpdateAt)
    .sort((a, b) => new Date(b.project.lastUpdateAt!).getTime() - new Date(a.project.lastUpdateAt!).getTime())
    .slice(0, 5)
    .map((s) => ({ ...s.project, derivedStatus: s.status }));

  res.json({ total, complete, inProgress, needsAttention, byStatus, byCategory, byCity, recentUpdates });
});

export default router;

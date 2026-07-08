import { Router, type IRouter } from "express";
import type { Response } from "express";
import { asc, eq, gte } from "drizzle-orm";
import {
  db,
  projectsTable,
  citiesTable,
  projectCategoriesTable,
  stagesTable,
  stageTemplatesTable,
  statusUpdatesTable,
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, PRIVILEGED_ROLES } from "../middlewares/requireAuth";

const router: IRouter = Router();

function forbidNonPrivileged(req: AuthenticatedRequest, res: Response): boolean {
  if (!(PRIVILEGED_ROLES as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" });
    return true;
  }
  return false;
}

router.get("/reports/distribution", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (forbidNonPrivileged(req, res)) return;

  const [projects, cities, categories, stages, templates] = await Promise.all([
    db.select().from(projectsTable),
    db.select().from(citiesTable),
    db.select().from(projectCategoriesTable),
    db.select().from(stagesTable),
    db.select().from(stageTemplatesTable),
  ]);
  const cityById = new Map(cities.map((c) => [c.id, c]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const templateNameById = new Map(templates.map((t) => [t.id, t.name]));

  let unstaged = 0;
  const stageCounts = new Map<number, number>();
  const cityCounts = new Map<number, number>();
  const categoryCounts = new Map<number, number>();
  for (const p of projects) {
    if (p.currentStageId == null || !stageById.has(p.currentStageId)) unstaged++;
    else stageCounts.set(p.currentStageId, (stageCounts.get(p.currentStageId) ?? 0) + 1);
    cityCounts.set(p.cityId, (cityCounts.get(p.cityId) ?? 0) + 1);
    categoryCounts.set(p.categoryId, (categoryCounts.get(p.categoryId) ?? 0) + 1);
  }

  const byStage = [...stageCounts.entries()]
    .map(([stageId, count]) => {
      const s = stageById.get(stageId)!;
      return {
        stageId,
        stageName: s.name,
        templateId: s.templateId,
        templateName: templateNameById.get(s.templateId) ?? "Unknown",
        orderIndex: s.orderIndex,
        count,
      };
    })
    .sort((a, b) => a.templateId - b.templateId || a.orderIndex - b.orderIndex || a.stageId - b.stageId);
  const byCity = [...cityCounts.entries()].map(([cityId, count]) => ({
    cityId,
    city: cityById.get(cityId)?.shortName ?? "Unknown",
    count,
  }));
  const byCategory = [...categoryCounts.entries()].map(([categoryId, count]) => ({
    categoryId,
    category: categoryById.get(categoryId)?.name ?? "Unknown",
    count,
  }));

  res.json({ total: projects.length, unstaged, byStage, byCity, byCategory });
});

router.get("/reports/stage-conversion", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (forbidNonPrivileged(req, res)) return;

  let template;
  const raw = req.query.templateId;
  if (raw !== undefined) {
    const templateId = Number(raw);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      res.status(400).json({ error: "templateId must be a positive integer" });
      return;
    }
    [template] = await db.select().from(stageTemplatesTable).where(eq(stageTemplatesTable.id, templateId));
  } else {
    [template] = await db.select().from(stageTemplatesTable).where(eq(stageTemplatesTable.isDefault, true));
  }
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  const [stages, projects] = await Promise.all([
    db.select().from(stagesTable).where(eq(stagesTable.templateId, template.id)).orderBy(asc(stagesTable.orderIndex)),
    db.select().from(projectsTable).where(eq(projectsTable.pipelineId, template.id)),
  ]);

  const orderIndexByStageId = new Map(stages.map((s) => [s.id, s.orderIndex]));
  const projectOrderIndexes = projects
    .map((p) => (p.currentStageId != null ? orderIndexByStageId.get(p.currentStageId) : undefined))
    .filter((o): o is number => o !== undefined);

  const totalProjects = projects.length;
  const stageRows = stages.map((s) => {
    const atStage = projects.filter((p) => p.currentStageId === s.id).length;
    const reached = projectOrderIndexes.filter((o) => o >= s.orderIndex).length;
    return {
      stageId: s.id,
      name: s.name,
      orderIndex: s.orderIndex,
      atStage,
      reached,
      reachedPct: totalProjects === 0 ? 0 : Math.round((reached / totalProjects) * 100),
    };
  });

  res.json({ templateId: template.id, templateName: template.name, totalProjects, stages: stageRows });
});

router.get("/reports/activity", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (forbidNonPrivileged(req, res)) return;

  let months = 6;
  const raw = req.query.months;
  if (raw !== undefined) {
    months = Number(raw);
    if (!Number.isInteger(months) || months < 1 || months > 24) {
      res.status(400).json({ error: "months must be an integer between 1 and 24" });
      return;
    }
  }

  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const keyOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  const [projects, updates] = await Promise.all([
    db.select({ createdAt: projectsTable.createdAt }).from(projectsTable).where(gte(projectsTable.createdAt, since)),
    db
      .select({
        createdAt: statusUpdatesTable.createdAt,
        reviewStatus: statusUpdatesTable.reviewStatus,
        reviewedAt: statusUpdatesTable.reviewedAt,
      })
      .from(statusUpdatesTable),
  ]);

  const buckets = new Map<string, { projectsCreated: number; updatesSubmitted: number; updatesApproved: number }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + i, 1));
    buckets.set(keyOf(d), { projectsCreated: 0, updatesSubmitted: 0, updatesApproved: 0 });
  }
  for (const p of projects) {
    const b = buckets.get(keyOf(new Date(p.createdAt)));
    if (b) b.projectsCreated++;
  }
  for (const u of updates) {
    const submitted = buckets.get(keyOf(new Date(u.createdAt)));
    if (submitted) submitted.updatesSubmitted++;
    if (u.reviewStatus === "approved" && u.reviewedAt) {
      const approved = buckets.get(keyOf(new Date(u.reviewedAt)));
      if (approved) approved.updatesApproved++;
    }
  }

  res.json({ months: [...buckets.entries()].map(([month, v]) => ({ month, ...v })) });
});

export default router;

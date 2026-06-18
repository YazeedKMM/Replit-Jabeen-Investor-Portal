import { Router, type IRouter } from "express";
import { eq, and, ilike, or, sql, inArray, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { projectsTable, usersTable, stageTemplatesTable, stagesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, MANAGER_ROLES, PRIVILEGED_ROLES, ADMIN_ROLE } from "../middlewares/requireAuth";
import { deriveProjectStatus } from "../lib/status";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

async function buildProjectScope(userId: number, role: string) {
  const isPrivileged = (PRIVILEGED_ROLES as readonly string[]).includes(role);
  return isPrivileged ? null : userId; // null means no filter needed (see all)
}

async function enrichProject(project: typeof projectsTable.$inferSelect, forRole: string) {
  const derivedStatus = await deriveProjectStatus(project);

  let currentStage = null;
  if (project.currentStageId) {
    const [s] = await db.select().from(stagesTable).where(eq(stagesTable.id, project.currentStageId));
    currentStage = s ?? null;
  }

  let investor = null;
  if (project.investorId && (PRIVILEGED_ROLES as readonly string[]).includes(forRole)) {
    const [u] = await db.select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      email: usersTable.email,
      companyName: usersTable.companyName,
      phone: usersTable.phone,
    }).from(usersTable).where(eq(usersTable.id, project.investorId));
    investor = u ?? null;
  }

  let pipelineName = null;
  if (project.pipelineId) {
    const [t] = await db.select({ name: stageTemplatesTable.name }).from(stageTemplatesTable).where(eq(stageTemplatesTable.id, project.pipelineId));
    pipelineName = t?.name ?? null;
  }

  return {
    ...project,
    derivedStatus,
    currentStage,
    investor,
    pipelineName,
  };
}

router.get("/projects", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { search, status, stage, sector } = req.query as Record<string, string>;
  const userId = req.user!.userId;
  const role = req.user!.role;
  const isPrivileged = (PRIVILEGED_ROLES as readonly string[]).includes(role);

  let query = db.select().from(projectsTable);

  // Scope
  if (!isPrivileged) {
    // Investor: only own projects
    const results = await db.select().from(projectsTable).where(eq(projectsTable.investorId, userId));
    const enriched = await Promise.all(results.map((p) => enrichProject(p, role)));
    let filtered = enriched;
    if (status) filtered = filtered.filter((p) => p.derivedStatus === status);
    res.json(filtered);
    return;
  }

  const conditions: ReturnType<typeof eq>[] = [];
  if (sector) conditions.push(eq(projectsTable.sector, sector));
  const rows = conditions.length
    ? await db.select().from(projectsTable).where(and(...conditions))
    : await db.select().from(projectsTable);

  let enriched = await Promise.all(rows.map((p) => enrichProject(p, role)));

  if (search) {
    const s = search.toLowerCase();
    enriched = enriched.filter((p) =>
      p.name.toLowerCase().includes(s) ||
      p.agreementNumber.toLowerCase().includes(s) ||
      p.sector.toLowerCase().includes(s) ||
      (p.investor && (
        (p.investor as { fullName: string }).fullName.toLowerCase().includes(s) ||
        (p.investor as { companyName: string }).companyName.toLowerCase().includes(s)
      ))
    );
  }
  if (status) enriched = enriched.filter((p) => p.derivedStatus === status);
  if (stage) enriched = enriched.filter((p) => (p.currentStage as { name?: string } | null)?.name === stage);

  res.json(enriched);
});

router.post("/projects", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const { name, sector, agreementNumber, plotNumber, pipelineId, constructionPct, investorId, notes } = req.body;
  if (!name || !sector || !agreementNumber) {
    res.status(400).json({ error: "name, sector, agreementNumber are required" }); return;
  }

  // Validate investorId is investor role
  if (investorId) {
    const [inv] = await db.select().from(usersTable).where(and(eq(usersTable.id, investorId), eq(usersTable.role, "investor")));
    if (!inv) { res.status(400).json({ error: "Assigned investor must be an Investor account" }); return; }
  }

  // Find first stage of pipeline
  let currentStageId: number | null = null;
  if (pipelineId) {
    const [firstStage] = await db.select().from(stagesTable).where(eq(stagesTable.templateId, pipelineId)).orderBy(stagesTable.orderIndex).limit(1);
    currentStageId = firstStage?.id ?? null;
  }

  const [project] = await db.insert(projectsTable).values({
    name,
    sector,
    agreementNumber,
    plotNumber: plotNumber ?? null,
    notes: notes ?? null,
    pipelineId: pipelineId ?? null,
    constructionPct: constructionPct ?? 0,
    investorId: investorId ?? null,
    currentStageId,
  }).returning();

  await logAudit({ action: "project.created", actorId: req.user!.userId, targetType: "project", targetId: project.id });
  const enriched = await enrichProject(project, req.user!.role);
  res.status(201).json(enriched);
});

router.get("/projects/export", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const rows = await db.select().from(projectsTable);
  const enriched = await Promise.all(rows.map((p) => enrichProject(p, req.user!.role)));

  const header = ["Agreement Number", "Name", "Sector", "Plot Number", "Pipeline", "Current Stage", "Construction %", "Derived Status", "Investor Company", "Investor Email", "Last Update", "Attention Flag"];
  const csvRows = enriched.map((p) => [
    p.agreementNumber,
    p.name,
    p.sector,
    p.plotNumber ?? "",
    p.pipelineName ?? "",
    (p.currentStage as { name?: string } | null)?.name ?? "",
    String(p.constructionPct),
    p.derivedStatus,
    (p.investor as { companyName?: string } | null)?.companyName ?? "",
    (p.investor as { email?: string } | null)?.email ?? "",
    p.lastUpdateAt ? new Date(p.lastUpdateAt).toISOString() : "",
    p.attentionFlag ? "Yes" : "No",
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));

  const csv = [header.map((h) => `"${h}"`).join(","), ...csvRows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="jabeen-portfolio-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

router.get("/projects/:projectId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const projectId = parseInt(Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const role = req.user!.role;
  const isPrivileged = (PRIVILEGED_ROLES as readonly string[]).includes(role);
  if (!isPrivileged && project.investorId !== req.user!.userId) {
    res.status(404).json({ error: "Project not found" }); return;
  }

  // Fetch full pipeline
  let pipeline = null;
  if (project.pipelineId) {
    const [tpl] = await db.select().from(stageTemplatesTable).where(eq(stageTemplatesTable.id, project.pipelineId));
    if (tpl) {
      const stages = await db.select().from(stagesTable).where(eq(stagesTable.templateId, tpl.id)).orderBy(stagesTable.orderIndex);
      pipeline = { ...tpl, stages };
    }
  }

  const derivedStatus = await deriveProjectStatus(project);

  let currentStage = null;
  if (project.currentStageId) {
    const [s] = await db.select().from(stagesTable).where(eq(stagesTable.id, project.currentStageId));
    currentStage = s ?? null;
  }

  let investor = null;
  if (project.investorId && isPrivileged) {
    const [u] = await db.select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      email: usersTable.email,
      companyName: usersTable.companyName,
      phone: usersTable.phone,
    }).from(usersTable).where(eq(usersTable.id, project.investorId));
    investor = u ?? null;
  }

  res.json({ ...project, derivedStatus, currentStage, investor, pipeline, pipelineName: pipeline?.name ?? null });
});

router.patch("/projects/:projectId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const projectId = parseInt(Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const { name, sector, plotNumber, notes, attentionFlag, constructionPct, investorId, pipelineId } = req.body;

  if (investorId !== undefined && investorId !== null) {
    const [inv] = await db.select().from(usersTable).where(and(eq(usersTable.id, investorId), eq(usersTable.role, "investor")));
    if (!inv) { res.status(400).json({ error: "Assigned investor must be an Investor account" }); return; }
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (sector !== undefined) updates.sector = sector;
  if (plotNumber !== undefined) updates.plotNumber = plotNumber;
  if (notes !== undefined) updates.notes = notes;
  if (attentionFlag !== undefined) updates.attentionFlag = attentionFlag;
  if (constructionPct !== undefined) updates.constructionPct = constructionPct;
  if (investorId !== undefined) updates.investorId = investorId;

  // Pipeline change: reset to first stage
  if (pipelineId !== undefined) {
    updates.pipelineId = pipelineId;
    if (pipelineId) {
      const [firstStage] = await db.select().from(stagesTable).where(eq(stagesTable.templateId, pipelineId)).orderBy(stagesTable.orderIndex).limit(1);
      updates.currentStageId = firstStage?.id ?? null;
    } else {
      updates.currentStageId = null;
    }
  }

  const [updated] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, projectId)).returning();
  await logAudit({ action: "project.updated", actorId: req.user!.userId, targetType: "project", targetId: projectId });
  const enriched = await enrichProject(updated, req.user!.role);
  res.json(enriched);
});

router.delete("/projects/:projectId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const projectId = parseInt(Array.isArray(req.params.projectId) ? req.params.projectId[0] : req.params.projectId);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
  await logAudit({ action: "project.deleted", actorId: req.user!.userId, targetType: "project", targetId: projectId });
  res.sendStatus(204);
});

export default router;

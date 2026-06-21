import { Router, type IRouter } from "express";
import { eq, and, or, isNull, desc, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { projectsTable, usersTable, stageTemplatesTable, stagesTable, stageFieldsTable, citiesTable, projectCategoriesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, MANAGER_ROLES, PRIVILEGED_ROLES, ADMIN_ROLE, CITY_SCOPED_ROLES, getAssignedCityIds } from "../middlewares/requireAuth";
import { deriveProjectStatus } from "../lib/status";
import { getStatusThresholds } from "../lib/settings-cache";
import { logAudit, logAuditDeduped } from "../lib/audit";
import { HttpError, parseId } from "../lib/http";

const router: IRouter = Router();

/** Validate an optional construction percentage (integer 0–100). */
function validateConstructionPct(value: unknown): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    throw new HttpError(400, "constructionPct must be an integer between 0 and 100");
  }
}

/**
 * Resolve a requested pipeline template ID to the latest non-archived version in that
 * template's family. This ensures that even if a user selects an older version from the
 * picker (e.g. due to a race condition), they are always pinned to the current version.
 * Returns the resolved ID, or null if no active version exists.
 */
async function resolveToLatestActiveVersion(requestedId: number): Promise<number | null> {
  const [tpl] = await db.select().from(stageTemplatesTable).where(eq(stageTemplatesTable.id, requestedId));
  if (!tpl) return null;
  if (tpl.archivedAt) return null; // requested version is already archived

  const rootId = tpl.parentTemplateId ?? tpl.id;

  // Find the highest non-archived version in this family
  const [latest] = await db.select()
    .from(stageTemplatesTable)
    .where(
      and(
        or(
          eq(stageTemplatesTable.id, rootId),
          eq(stageTemplatesTable.parentTemplateId, rootId)
        ),
        isNull(stageTemplatesTable.archivedAt)
      )
    )
    .orderBy(desc(stageTemplatesTable.versionNumber))
    .limit(1);

  return latest?.id ?? null;
}

/** Mark a template version as having been assigned (durable "ever assigned" tracking). */
async function markTemplateAssigned(templateId: number): Promise<void> {
  await db.update(stageTemplatesTable)
    .set({ wasEverAssigned: true })
    .where(eq(stageTemplatesTable.id, templateId));
}

async function buildProjectScope(userId: number, role: string) {
  const isPrivileged = (PRIVILEGED_ROLES as readonly string[]).includes(role);
  return isPrivileged ? null : userId;
}

async function enrichProject(project: typeof projectsTable.$inferSelect, forRole: string, stalledDays?: number, delayedDays?: number) {
  const thresholds = stalledDays === undefined || delayedDays === undefined ? await getStatusThresholds() : null;
  const resolvedStalledDays = stalledDays ?? thresholds!.stalledDays;
  const resolvedDelayedDays = delayedDays ?? thresholds!.delayedDays;
  const derivedStatus = await deriveProjectStatus(project, resolvedStalledDays, resolvedDelayedDays);

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

  let city = null;
  const [c] = await db.select().from(citiesTable).where(eq(citiesTable.id, project.cityId));
  city = c ?? null;

  let category = null;
  const [cat] = await db.select().from(projectCategoriesTable).where(eq(projectCategoriesTable.id, project.categoryId));
  category = cat ?? null;

  return {
    ...project,
    derivedStatus,
    currentStage,
    investor,
    pipelineName,
    city,
    category,
  };
}

/** Sanitize a CSV cell value to prevent formula injection. */
function sanitizeCsvCell(value: string): string {
  if (value.length > 0 && (
    value[0] === "=" ||
    value[0] === "+" ||
    value[0] === "-" ||
    value[0] === "@" ||
    value[0] === "\t" ||
    value[0] === "\r"
  )) {
    return `'${value}`;
  }
  return value;
}

router.get("/projects", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { search, status, stage, cityId: cityIdParam } = req.query as Record<string, string>;
  const userId = req.user!.userId;
  const role = req.user!.role;
  const isPrivileged = (PRIVILEGED_ROLES as readonly string[]).includes(role);
  const { stalledDays, delayedDays } = await getStatusThresholds();

  if (!isPrivileged) {
    const results = await db.select().from(projectsTable).where(eq(projectsTable.investorId, userId));
    const enriched = await Promise.all(results.map((p) => enrichProject(p, role, stalledDays, delayedDays)));
    let filtered = enriched;
    if (status) filtered = filtered.filter((p) => p.derivedStatus === status);
    res.json(filtered);
    return;
  }

  const conditions: (ReturnType<typeof eq> | ReturnType<typeof inArray>)[] = [];
  const isCityScoped = (CITY_SCOPED_ROLES as readonly string[]).includes(role);
  if (isCityScoped) {
    const assigned = await getAssignedCityIds(userId);
    if (assigned.length === 0) { res.json([]); return; }
    conditions.push(inArray(projectsTable.cityId, assigned));
  }
  if (cityIdParam) {
    conditions.push(eq(projectsTable.cityId, Number(cityIdParam)));
  }
  const rows = conditions.length
    ? await db.select().from(projectsTable).where(and(...conditions))
    : await db.select().from(projectsTable);

  let enriched = await Promise.all(rows.map((p) => enrichProject(p, role, stalledDays, delayedDays)));

  if (search) {
    const s = search.toLowerCase();
    enriched = enriched.filter((p) =>
      p.name.toLowerCase().includes(s) ||
      p.agreementNumber.toLowerCase().includes(s) ||
      (p.category?.name ?? "").toLowerCase().includes(s) ||
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
  const { name, cityId, categoryId, agreementNumber, plotNumber, pipelineId: rawPipelineId, constructionPct, investorId, notes } = req.body;
  if (!name || !cityId || !categoryId || !agreementNumber) {
    res.status(400).json({ error: "name, cityId, categoryId, agreementNumber are required" }); return;
  }
  validateConstructionPct(constructionPct);

  const [cityRow] = await db.select().from(citiesTable).where(eq(citiesTable.id, cityId));
  if (!cityRow) { res.status(400).json({ error: "Unknown city" }); return; }
  const [catRow] = await db.select().from(projectCategoriesTable).where(eq(projectCategoriesTable.id, categoryId));
  if (!catRow) { res.status(400).json({ error: "Unknown category" }); return; }
  if ((CITY_SCOPED_ROLES as readonly string[]).includes(req.user!.role)) {
    const assigned = await getAssignedCityIds(req.user!.userId);
    if (!assigned.includes(cityId)) { res.status(403).json({ error: "Forbidden: city not assigned to you" }); return; }
  }

  if (investorId) {
    const [inv] = await db.select().from(usersTable).where(and(eq(usersTable.id, investorId), eq(usersTable.role, "investor")));
    if (!inv) { res.status(400).json({ error: "Assigned investor must be an Investor account" }); return; }
  }

  // Resolve pipeline to latest non-archived version
  let resolvedPipelineId: number | null = null;
  if (rawPipelineId) {
    resolvedPipelineId = await resolveToLatestActiveVersion(rawPipelineId);
    if (!resolvedPipelineId) {
      res.status(400).json({ error: "The selected pipeline template is archived or does not exist" }); return;
    }
  }

  let currentStageId: number | null = null;
  if (resolvedPipelineId) {
    const [firstStage] = await db.select().from(stagesTable)
      .where(eq(stagesTable.templateId, resolvedPipelineId))
      .orderBy(stagesTable.orderIndex)
      .limit(1);
    currentStageId = firstStage?.id ?? null;
  }

  const [project] = await db.insert(projectsTable).values({
    name,
    cityId,
    categoryId,
    agreementNumber,
    plotNumber: plotNumber ?? null,
    notes: notes ?? null,
    pipelineId: resolvedPipelineId,
    constructionPct: constructionPct ?? 0,
    investorId: investorId ?? null,
    currentStageId,
    version: 1,
  }).returning();

  // Mark the template version as having been assigned
  if (resolvedPipelineId) {
    await markTemplateAssigned(resolvedPipelineId);
  }

  await logAudit({ action: "project.created", actorId: req.user!.userId, targetType: "project", targetId: project.id });
  const enriched = await enrichProject(project, req.user!.role);
  res.status(201).json(enriched);
});

router.get("/projects/export", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const { stalledDays, delayedDays } = await getStatusThresholds();
  let rows;
  if ((CITY_SCOPED_ROLES as readonly string[]).includes(req.user!.role)) {
    const assigned = await getAssignedCityIds(req.user!.userId);
    rows = assigned.length ? await db.select().from(projectsTable).where(inArray(projectsTable.cityId, assigned)) : [];
  } else {
    rows = await db.select().from(projectsTable);
  }
  const enriched = await Promise.all(rows.map((p) => enrichProject(p, req.user!.role, stalledDays, delayedDays)));

  // Audit: record the portfolio export
  await logAudit({ action: "portfolio-exported", actorId: req.user!.userId, targetType: "portfolio", detail: `exported ${enriched.length} projects` });

  const header = ["Agreement Number", "Name", "City", "Category", "Plot Number", "Pipeline", "Current Stage", "Construction %", "Derived Status", "Investor Company", "Investor Email", "Last Update", "Attention Flag"];
  const csvRows = enriched.map((p) => [
    p.agreementNumber,
    p.name,
    (p.city as { shortName?: string } | null)?.shortName ?? "",
    (p.category as { name?: string } | null)?.name ?? "",
    p.plotNumber ?? "",
    p.pipelineName ?? "",
    (p.currentStage as { name?: string } | null)?.name ?? "",
    String(p.constructionPct),
    p.derivedStatus,
    (p.investor as { companyName?: string } | null)?.companyName ?? "",
    (p.investor as { email?: string } | null)?.email ?? "",
    p.lastUpdateAt ? new Date(p.lastUpdateAt).toISOString() : "",
    p.attentionFlag ? "Yes" : "No",
  ].map((v) => {
    const sanitized = sanitizeCsvCell(String(v));
    return `"${sanitized.replace(/"/g, '""')}"`;
  }).join(","));

  const csv = [header.map((h) => `"${h}"`).join(","), ...csvRows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="jabeen-portfolio-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

router.get("/projects/:projectId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const projectId = parseId(req.params.projectId);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const role = req.user!.role;
  const isPrivileged = (PRIVILEGED_ROLES as readonly string[]).includes(role);
  if (!isPrivileged && project.investorId !== req.user!.userId) {
    res.status(404).json({ error: "Project not found" }); return;
  }

  if ((CITY_SCOPED_ROLES as readonly string[]).includes(role)) {
    const assigned = await getAssignedCityIds(req.user!.userId);
    if (!assigned.includes(project.cityId)) { res.status(403).json({ error: "Forbidden" }); return; }
  }

  // Fetch the specific pinned template version — stages from that version
  let pipeline = null;
  if (project.pipelineId) {
    const [tpl] = await db.select().from(stageTemplatesTable).where(eq(stageTemplatesTable.id, project.pipelineId));
    if (tpl) {
      const rawStages = await db.select().from(stagesTable).where(eq(stagesTable.templateId, tpl.id)).orderBy(stagesTable.orderIndex);
      const stages = await Promise.all(
        rawStages.map(async (s) => {
          const fields = await db.select().from(stageFieldsTable).where(eq(stageFieldsTable.stageId, s.id)).orderBy(stageFieldsTable.position);
          return { ...s, fields };
        })
      );
      pipeline = { ...tpl, stages };
    }
  }

  const { stalledDays, delayedDays } = await getStatusThresholds();
  const derivedStatus = await deriveProjectStatus(project, stalledDays, delayedDays);

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

    // Audit: record privileged view of investor contact details.
    // Deduped to once per actor+project per hour so routine page loads/refreshes
    // don't flood the audit log.
    if (investor) {
      await logAuditDeduped({
        action: "investor-contact-viewed",
        actorId: req.user!.userId,
        targetType: "project",
        targetId: projectId,
        detail: `investor:${project.investorId}`,
      });
    }
  }

  res.json({ ...project, derivedStatus, currentStage, investor, pipeline, pipelineName: pipeline?.name ?? null });
});

router.patch("/projects/:projectId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const projectId = parseId(req.params.projectId);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  if ((CITY_SCOPED_ROLES as readonly string[]).includes(req.user!.role)) {
    const assigned = await getAssignedCityIds(req.user!.userId);
    if (!assigned.includes(project.cityId)) { res.status(403).json({ error: "Forbidden" }); return; }
  }

  // Optimistic concurrency: version is mandatory — reject if missing or stale
  const { name, cityId, categoryId, plotNumber, notes, attentionFlag, constructionPct, investorId, pipelineId: rawPipelineId, version } = req.body;
  validateConstructionPct(constructionPct);
  if (version === undefined || version === null) {
    res.status(400).json({ error: "version is required for project updates. Fetch the project first and include its current version.", code: "VERSION_REQUIRED" });
    return;
  }
  if (typeof version !== "number" || version !== project.version) {
    res.status(409).json({ error: "Conflict: project was modified by another request. Please reload and try again.", code: "VERSION_CONFLICT" });
    return;
  }

  if (investorId !== undefined && investorId !== null) {
    const [inv] = await db.select().from(usersTable).where(and(eq(usersTable.id, investorId), eq(usersTable.role, "investor")));
    if (!inv) { res.status(400).json({ error: "Assigned investor must be an Investor account" }); return; }
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (plotNumber !== undefined) updates.plotNumber = plotNumber;
  if (notes !== undefined) updates.notes = notes;
  if (attentionFlag !== undefined) updates.attentionFlag = attentionFlag;
  if (constructionPct !== undefined) updates.constructionPct = constructionPct;
  if (investorId !== undefined) updates.investorId = investorId;

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

  // Pipeline change: only resolve/validate when the pipeline is actually changing.
  if (rawPipelineId !== undefined && rawPipelineId !== project.pipelineId) {
    if (rawPipelineId === null) {
      updates.pipelineId = null;
      updates.currentStageId = null;
    } else {
      const resolvedPipelineId = await resolveToLatestActiveVersion(rawPipelineId);
      if (!resolvedPipelineId) {
        res.status(400).json({ error: "The selected pipeline template is archived or does not exist" }); return;
      }
      updates.pipelineId = resolvedPipelineId;
      const [firstStage] = await db.select().from(stagesTable)
        .where(eq(stagesTable.templateId, resolvedPipelineId))
        .orderBy(stagesTable.orderIndex)
        .limit(1);
      updates.currentStageId = firstStage?.id ?? null;

      // Mark the resolved template version as having been assigned
      await markTemplateAssigned(resolvedPipelineId);
    }
  }

  // Increment version on every successful update
  updates.version = project.version + 1;

  // Use conditional update to guard against concurrent edits at DB level
  const result = await db.update(projectsTable)
    .set(updates)
    .where(and(
      eq(projectsTable.id, projectId),
      eq(projectsTable.version, project.version)
    ))
    .returning();

  if (result.length === 0) {
    res.status(409).json({ error: "Conflict: project was modified concurrently. Please reload and try again.", code: "VERSION_CONFLICT" });
    return;
  }

  const [updated] = result;
  await logAudit({ action: "project.updated", actorId: req.user!.userId, targetType: "project", targetId: projectId });
  const enriched = await enrichProject(updated, req.user!.role);
  res.json(enriched);
});

router.delete("/projects/:projectId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const projectId = parseId(req.params.projectId);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
  await logAudit({ action: "project.deleted", actorId: req.user!.userId, targetType: "project", targetId: projectId });
  res.sendStatus(204);
});

export default router;

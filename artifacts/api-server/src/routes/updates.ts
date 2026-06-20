import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  projectsTable, statusUpdatesTable, stagesTable, stageFieldsTable,
  fieldValuesTable, usersTable
} from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, MANAGER_ROLES, PRIVILEGED_ROLES } from "../middlewares/requireAuth";
import { createNotifications, getManagerIds } from "../lib/notifications";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw);
}

async function getProjectScoped(projectId: number, userId: number, role: string) {
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) return null;
  const isPrivileged = (PRIVILEGED_ROLES as readonly string[]).includes(role);
  if (!isPrivileged && project.investorId !== userId) return null;
  return project;
}

async function enrichUpdate(update: typeof statusUpdatesTable.$inferSelect) {
  const [author] = await db.select({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, role: usersTable.role, companyName: usersTable.companyName }).from(usersTable).where(eq(usersTable.id, update.authorId));
  let reviewer = null;
  if (update.reviewerId) {
    const [r] = await db.select({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, role: usersTable.role, companyName: usersTable.companyName }).from(usersTable).where(eq(usersTable.id, update.reviewerId));
    reviewer = r;
  }
  let targetStage = null;
  if (update.targetStageId) {
    const [s] = await db.select().from(stagesTable).where(eq(stagesTable.id, update.targetStageId));
    targetStage = s;
  }
  const fvRows = await db.select().from(fieldValuesTable).where(eq(fieldValuesTable.updateId, update.id));
  const fieldValues = await Promise.all(fvRows.map(async (fv) => {
    const [field] = await db.select({ name: stageFieldsTable.name, widget: stageFieldsTable.widget, baseType: stageFieldsTable.baseType }).from(stageFieldsTable).where(eq(stageFieldsTable.id, fv.fieldId));
    return { ...fv, fieldName: field?.name ?? "", widget: field?.widget ?? null, baseType: field?.baseType ?? null };
  }));
  return { ...update, author, reviewer, targetStage, fieldValues };
}

router.get("/projects/:projectId/updates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const projectId = parseId(req.params.projectId);
  const project = await getProjectScoped(projectId, req.user!.userId, req.user!.role);
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const rows = await db.select().from(statusUpdatesTable).where(eq(statusUpdatesTable.projectId, projectId)).orderBy(desc(statusUpdatesTable.createdAt));
  const enriched = await Promise.all(rows.map(enrichUpdate));
  res.json(enriched);
});

router.post("/projects/:projectId/updates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const projectId = parseId(req.params.projectId);
  const project = await getProjectScoped(projectId, req.user!.userId, req.user!.role);
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  if (!project.pipelineId) { res.status(409).json({ error: "Project has no assigned pipeline" }); return; }

  const { targetStageId, constructionPct, note, fieldValues } = req.body;
  if (!targetStageId) { res.status(400).json({ error: "targetStageId is required" }); return; }

  // Validate target stage belongs to pipeline
  const [targetStage] = await db.select().from(stagesTable).where(and(eq(stagesTable.id, targetStageId), eq(stagesTable.templateId, project.pipelineId)));
  if (!targetStage) { res.status(422).json({ error: "Target stage not in project pipeline" }); return; }

  const isManager = (MANAGER_ROLES as readonly string[]).includes(req.user!.role);

  // Check single pending update rule for investors
  if (!isManager) {
    const [pending] = await db.select().from(statusUpdatesTable).where(
      and(eq(statusUpdatesTable.projectId, projectId), eq(statusUpdatesTable.reviewStatus, "pending"))
    );
    if (pending) { res.status(409).json({ error: "A pending update already exists for this project" }); return; }
  }

  const effectivePct = constructionPct ?? targetStage.progressBaseline;
  const reviewStatus = isManager ? "approved" : "pending";
  const sourceStageId = project.currentStageId;

  const [update] = await db.insert(statusUpdatesTable).values({
    projectId,
    authorId: req.user!.userId,
    sourceStageId: sourceStageId ?? null,
    targetStageId,
    constructionPct: effectivePct,
    note: note ?? null,
    reviewStatus,
    reviewerId: isManager ? req.user!.userId : null,
    reviewedAt: isManager ? new Date() : null,
  }).returning();

  // Persist field values
  if (fieldValues && Array.isArray(fieldValues)) {
    for (const fv of fieldValues) {
      await db.insert(fieldValuesTable).values({
        updateId: update.id,
        fieldId: fv.fieldId,
        textValue: fv.textValue ?? null,
        numValue: fv.numValue != null ? String(fv.numValue) : null,
        dateValue: fv.dateValue ?? null,
        boolValue: fv.boolValue != null ? String(fv.boolValue) : null,
        choiceValue: fv.choiceValue ?? null,
      });
    }
  }

  // If manager: advance project
  if (isManager) {
    await db.update(projectsTable).set({
      currentStageId: targetStageId,
      constructionPct: effectivePct,
      lastUpdateAt: new Date(),
    }).where(eq(projectsTable.id, projectId));
  }

  // Notifications
  if (!isManager && project.investorId) {
    const managerIds = await getManagerIds();
    await createNotifications({
      kind: "update-submitted",
      recipientIds: managerIds,
      actorId: req.user!.userId,
      projectId,
      title: `Update submitted for ${project.name}`,
      body: note ?? undefined,
    });
  }

  await logAudit({ action: "update.submitted", actorId: req.user!.userId, targetType: "update", targetId: update.id, detail: `project:${projectId}` });
  const enriched = await enrichUpdate(update);
  res.status(201).json(enriched);
});

router.patch("/projects/:projectId/updates/:updateId/approve", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const projectId = parseId(req.params.projectId);
  const updateId = parseId(req.params.updateId);

  const project = await getProjectScoped(projectId, req.user!.userId, req.user!.role);
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const [update] = await db.select().from(statusUpdatesTable).where(and(eq(statusUpdatesTable.id, updateId), eq(statusUpdatesTable.projectId, projectId)));
  if (!update) { res.status(404).json({ error: "Update not found" }); return; }

  // Guard: target stage must still be in pipeline
  const [targetStage] = project.pipelineId
    ? await db.select().from(stagesTable).where(and(eq(stagesTable.id, update.targetStageId), eq(stagesTable.templateId, project.pipelineId)))
    : [];
  if (!targetStage) { res.status(409).json({ error: "Target stage no longer in project pipeline. Reject and resubmit." }); return; }

  // Guard: no backward movement
  if (project.currentStageId) {
    const [current] = await db.select({ orderIndex: stagesTable.orderIndex }).from(stagesTable).where(eq(stagesTable.id, project.currentStageId));
    if (current && targetStage.orderIndex < current.orderIndex) {
      res.status(409).json({ error: "Target stage precedes current stage. Submit a new update." }); return;
    }
  }

  // Atomic approval: only succeeds if the update is still pending — prevents double-approval
  const approvedRows = await db.update(statusUpdatesTable).set({
    reviewStatus: "approved",
    reviewerId: req.user!.userId,
    reviewedAt: new Date(),
    sourceStageId: project.currentStageId ?? null,
  }).where(
    and(
      eq(statusUpdatesTable.id, updateId),
      eq(statusUpdatesTable.reviewStatus, "pending")
    )
  ).returning();

  if (approvedRows.length === 0) {
    res.status(409).json({ error: "Update has already been reviewed by another reviewer." });
    return;
  }

  const [approved] = approvedRows;

  // Advance project
  await db.update(projectsTable).set({
    currentStageId: update.targetStageId,
    constructionPct: update.constructionPct,
    lastUpdateAt: new Date(),
  }).where(eq(projectsTable.id, projectId));

  // Notify investor
  if (project.investorId) {
    await createNotifications({
      kind: "update-approved",
      recipientIds: [project.investorId],
      actorId: req.user!.userId,
      projectId,
      title: `Your update for ${project.name} was approved`,
    });
  }

  await logAudit({ action: "update.approved", actorId: req.user!.userId, targetType: "update", targetId: updateId });
  const enriched = await enrichUpdate(approved);
  res.json(enriched);
});

router.patch("/projects/:projectId/updates/:updateId/reject", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const projectId = parseId(req.params.projectId);
  const updateId = parseId(req.params.updateId);

  const project = await getProjectScoped(projectId, req.user!.userId, req.user!.role);
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const [update] = await db.select().from(statusUpdatesTable).where(and(eq(statusUpdatesTable.id, updateId), eq(statusUpdatesTable.projectId, projectId)));
  if (!update) { res.status(404).json({ error: "Update not found" }); return; }

  const { reviewNote } = req.body ?? {};

  // Atomic rejection: only succeeds if the update is still pending — prevents double-review
  const rejectedRows = await db.update(statusUpdatesTable).set({
    reviewStatus: "rejected",
    reviewerId: req.user!.userId,
    reviewedAt: new Date(),
    reviewNote: reviewNote ?? null,
  }).where(
    and(
      eq(statusUpdatesTable.id, updateId),
      eq(statusUpdatesTable.reviewStatus, "pending")
    )
  ).returning();

  if (rejectedRows.length === 0) {
    res.status(409).json({ error: "Update has already been reviewed by another reviewer." });
    return;
  }

  const [rejected] = rejectedRows;

  if (project.investorId) {
    await createNotifications({
      kind: "update-rejected",
      recipientIds: [project.investorId],
      actorId: req.user!.userId,
      projectId,
      title: `Your update for ${project.name} was rejected`,
      body: reviewNote ?? undefined,
    });
  }

  await logAudit({ action: "update.rejected", actorId: req.user!.userId, targetType: "update", targetId: updateId });
  const enriched = await enrichUpdate(rejected);
  res.json(enriched);
});

export default router;

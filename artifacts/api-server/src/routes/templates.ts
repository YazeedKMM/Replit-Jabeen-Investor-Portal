import { Router, type IRouter } from "express";
import { eq, and, ne, or, inArray, isNull, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { stageTemplatesTable, stagesTable, stageFieldsTable, projectsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, MANAGER_ROLES } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw);
}

const WIDGET_COMPAT: Record<string, string[]> = {
  "text": ["single-line", "multi-line", "email", "telephone"],
  "number": ["number"],
  "date": ["date"],
  "boolean": ["checkbox", "toggle"],
  "file": ["file-upload"],
  "image": ["single-photo", "photo-gallery"],
  "single-choice": ["drop-list", "list-box", "radio"],
  "multi-choice": ["checkbox-list", "list-box"],
};

/** Get the root ID of a template family (the ancestor with no parentTemplateId) */
function getRootId(tpl: typeof stageTemplatesTable.$inferSelect): number {
  return tpl.parentTemplateId ?? tpl.id;
}

/** Get all version rows in a template family (same root) */
async function getFamilyVersions(rootId: number): Promise<(typeof stageTemplatesTable.$inferSelect)[]> {
  return db.select()
    .from(stageTemplatesTable)
    .where(
      or(
        eq(stageTemplatesTable.id, rootId),
        eq(stageTemplatesTable.parentTemplateId, rootId)
      )
    );
}

/**
 * Check if any version in the family was EVER assigned (durably tracked via wasEverAssigned,
 * with a fallback for seed-data rows that predate this column).
 */
async function wasFamilyEverAssigned(familyVersions: (typeof stageTemplatesTable.$inferSelect)[]): Promise<boolean> {
  const familyIds = familyVersions.map(v => v.id);
  // Durable tracking first
  if (familyVersions.some(v => v.wasEverAssigned)) return true;
  // Fallback: check current project rows (covers seed data that predates the column)
  if (familyIds.length === 0) return false;
  const rows = await db.select({ id: projectsTable.id })
    .from(projectsTable)
    .where(inArray(projectsTable.pipelineId, familyIds))
    .limit(1);
  return rows.length > 0;
}

/**
 * Check if THIS specific template version was ever assigned (durably or currently).
 */
async function wasVersionEverAssigned(tpl: typeof stageTemplatesTable.$inferSelect): Promise<boolean> {
  if (tpl.wasEverAssigned) return true;
  // Fallback for seed data
  const rows = await db.select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.pipelineId, tpl.id))
    .limit(1);
  return rows.length > 0;
}

/** Count projects currently assigned to any version of the template family */
async function countCurrentAssignments(familyIds: number[]): Promise<number> {
  if (familyIds.length === 0) return 0;
  const rows = await db.select({ id: projectsTable.id })
    .from(projectsTable)
    .where(inArray(projectsTable.pipelineId, familyIds));
  return rows.length;
}

/** Count projects currently assigned to this specific template version */
async function countVersionCurrentAssignments(templateId: number): Promise<number> {
  const rows = await db.select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.pipelineId, templateId));
  return rows.length;
}

/** Get the next version number for a template family */
async function getNextVersionNumber(rootId: number): Promise<number> {
  const versions = await db.select({ versionNumber: stageTemplatesTable.versionNumber })
    .from(stageTemplatesTable)
    .where(
      or(
        eq(stageTemplatesTable.id, rootId),
        eq(stageTemplatesTable.parentTemplateId, rootId)
      )
    );
  const max = versions.reduce((m, v) => Math.max(m, v.versionNumber), 0);
  return max + 1;
}

async function getFullTemplate(templateId: number) {
  const [tpl] = await db.select().from(stageTemplatesTable).where(eq(stageTemplatesTable.id, templateId));
  if (!tpl) return null;
  const stages = await db.select().from(stagesTable).where(eq(stagesTable.templateId, templateId)).orderBy(stagesTable.orderIndex);
  const stagesWithFields = await Promise.all(stages.map(async (s) => {
    const fields = await db.select().from(stageFieldsTable).where(eq(stageFieldsTable.stageId, s.id)).orderBy(stageFieldsTable.position);
    return { ...s, fields };
  }));
  const rootId = getRootId(tpl);
  const familyVersions = await getFamilyVersions(rootId);
  const assignedProjectCount = await countCurrentAssignments(familyVersions.map(v => v.id));
  return { ...tpl, stages: stagesWithFields, assignedProjectCount };
}

async function insertStages(templateId: number, stages: any[]) {
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const [stage] = await db.insert(stagesTable).values({
      templateId,
      name: s.name,
      description: s.description ?? null,
      orderIndex: i,
      progressBaseline: s.progressBaseline ?? 0,
      category: s.category,
    }).returning();
    if (s.fields) {
      for (let j = 0; j < s.fields.length; j++) {
        const f = s.fields[j];
        await db.insert(stageFieldsTable).values({
          stageId: stage.id,
          name: f.name,
          baseType: f.baseType,
          widget: f.widget,
          required: f.required ?? false,
          position: j,
          options: f.options ?? null,
          config: f.config ?? null,
        });
      }
    }
  }
}

function validateStages(stages: any[]): string | null {
  for (const s of stages) {
    if (!s.fields) continue;
    for (const f of s.fields) {
      const allowed = WIDGET_COMPAT[f.baseType] ?? [];
      if (!allowed.includes(f.widget)) {
        return `Widget '${f.widget}' incompatible with baseType '${f.baseType}'`;
      }
      if (["single-choice", "multi-choice"].includes(f.baseType) && (!f.options || f.options.length === 0)) {
        return `Choice field '${f.name}' must have at least one option`;
      }
    }
  }
  return null;
}

router.get("/templates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const includeArchived = req.query.includeArchived === "true";

  const rows = includeArchived
    ? await db.select().from(stageTemplatesTable).orderBy(stageTemplatesTable.name)
    : await db.select().from(stageTemplatesTable)
        .where(isNull(stageTemplatesTable.archivedAt))
        .orderBy(stageTemplatesTable.name);

  const result = await Promise.all(rows.map(async (tpl) => {
    const stages = await db.select().from(stagesTable).where(eq(stagesTable.templateId, tpl.id));
    const rootId = getRootId(tpl);
    const familyVersions = await getFamilyVersions(rootId);
    const assignedProjectCount = await countCurrentAssignments(familyVersions.map(v => v.id));
    return { ...tpl, stageCount: stages.length, assignedProjectCount };
  }));
  res.json(result);
});

router.post("/templates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, description, isDefault, stages } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  if (stages) {
    const validationError = validateStages(stages);
    if (validationError) { res.status(400).json({ error: validationError }); return; }
  }

  if (isDefault) {
    await db.update(stageTemplatesTable).set({ isDefault: false });
  }

  const [tpl] = await db.insert(stageTemplatesTable).values({
    name,
    description: description ?? null,
    isDefault: isDefault ?? false,
    versionNumber: 1,
    parentTemplateId: null,
    wasEverAssigned: false,
  }).returning();

  if (stages) {
    await insertStages(tpl.id, stages);
  }

  await logAudit({ action: "template.created", actorId: req.user!.userId, targetType: "template", targetId: tpl.id });
  const full = await getFullTemplate(tpl.id);
  res.status(201).json(full);
});

router.get("/templates/:templateId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const templateId = parseId(req.params.templateId);
  const full = await getFullTemplate(templateId);
  if (!full) { res.status(404).json({ error: "Not found" }); return; }
  res.json(full);
});

router.put("/templates/:templateId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const templateId = parseId(req.params.templateId);
  const [existing] = await db.select().from(stageTemplatesTable).where(eq(stageTemplatesTable.id, templateId));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.archivedAt) { res.status(409).json({ error: "Template is archived and cannot be edited. Create a new template instead." }); return; }

  const { name, description, isDefault, stages } = req.body;

  if (stages) {
    const validationError = validateStages(stages);
    if (validationError) { res.status(400).json({ error: validationError }); return; }
  }

  // "Ever assigned" check — durable via wasEverAssigned, with current-rows fallback for seed data
  const everAssigned = await wasVersionEverAssigned(existing);

  if (everAssigned) {
    // Must create a new version — old version is immutable once it has been assigned
    const rootId = getRootId(existing);
    const nextVersion = await getNextVersionNumber(rootId);

    if (isDefault) {
      await db.update(stageTemplatesTable).set({ isDefault: false });
    }

    const [newTpl] = await db.insert(stageTemplatesTable).values({
      name: name ?? existing.name,
      description: description !== undefined ? description : existing.description,
      isDefault: isDefault ?? existing.isDefault,
      parentTemplateId: rootId,
      versionNumber: nextVersion,
      wasEverAssigned: false,
    }).returning();

    if (stages) {
      await insertStages(newTpl.id, stages);
    }

    // Archive the old version (it is now superseded; projects remain pinned to its id)
    await db.update(stageTemplatesTable)
      .set({ archivedAt: new Date(), isDefault: false })
      .where(eq(stageTemplatesTable.id, templateId));

    await logAudit({ action: "template.versioned", actorId: req.user!.userId, targetType: "template", targetId: newTpl.id });
    const full = await getFullTemplate(newTpl.id);
    res.json({ template: full, versionCreated: true });
    return;
  }

  // Never assigned — mutate in place
  if (isDefault) {
    await db.update(stageTemplatesTable).set({ isDefault: false }).where(ne(stageTemplatesTable.id, templateId));
  }

  await db.update(stageTemplatesTable)
    .set({
      name: name ?? existing.name,
      description: description !== undefined ? description : existing.description,
      isDefault: isDefault ?? existing.isDefault,
    })
    .where(eq(stageTemplatesTable.id, templateId));

  if (stages) {
    await db.delete(stagesTable).where(eq(stagesTable.templateId, templateId));
    await insertStages(templateId, stages);
  }

  await logAudit({ action: "template.updated", actorId: req.user!.userId, targetType: "template", targetId: templateId });
  const full = await getFullTemplate(templateId);
  res.json({ template: full, versionCreated: false });
});

router.delete("/templates/:templateId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const templateId = parseId(req.params.templateId);
  const [existing] = await db.select().from(stageTemplatesTable).where(eq(stageTemplatesTable.id, templateId));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const rootId = getRootId(existing);
  const familyVersions = await getFamilyVersions(rootId);
  const familyEverAssigned = await wasFamilyEverAssigned(familyVersions);

  if (familyEverAssigned) {
    // Any version in this family was ever assigned — archive instead of hard-delete
    await db.update(stageTemplatesTable)
      .set({ archivedAt: new Date(), isDefault: false })
      .where(eq(stageTemplatesTable.id, templateId));
    await logAudit({ action: "template.archived", actorId: req.user!.userId, targetType: "template", targetId: templateId });
    res.status(200).json({ archived: true, id: templateId });
    return;
  }

  // No version in this family was ever assigned — hard-delete
  await db.delete(stageTemplatesTable).where(eq(stageTemplatesTable.id, templateId));
  await logAudit({ action: "template.deleted", actorId: req.user!.userId, targetType: "template", targetId: templateId });
  res.sendStatus(204);
});

router.post("/templates/:templateId/archive", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const templateId = parseId(req.params.templateId);
  const [existing] = await db.select().from(stageTemplatesTable).where(eq(stageTemplatesTable.id, templateId));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.archivedAt) { res.status(409).json({ error: "Template is already archived" }); return; }

  await db.update(stageTemplatesTable)
    .set({ archivedAt: new Date(), isDefault: false })
    .where(eq(stageTemplatesTable.id, templateId));
  await logAudit({ action: "template.archived", actorId: req.user!.userId, targetType: "template", targetId: templateId });
  res.status(200).json({ archived: true, id: templateId });
});

export default router;

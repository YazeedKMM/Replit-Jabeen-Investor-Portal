import { Router, type IRouter } from "express";
import { eq, and, ne } from "drizzle-orm";
import { db } from "@workspace/db";
import { stageTemplatesTable, stagesTable, stageFieldsTable } from "@workspace/db";
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

async function getFullTemplate(templateId: number) {
  const [tpl] = await db.select().from(stageTemplatesTable).where(eq(stageTemplatesTable.id, templateId));
  if (!tpl) return null;
  const stages = await db.select().from(stagesTable).where(eq(stagesTable.templateId, templateId)).orderBy(stagesTable.orderIndex);
  const stagesWithFields = await Promise.all(stages.map(async (s) => {
    const fields = await db.select().from(stageFieldsTable).where(eq(stageFieldsTable.stageId, s.id)).orderBy(stageFieldsTable.position);
    return { ...s, fields };
  }));
  return { ...tpl, stages: stagesWithFields };
}

router.get("/templates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const rows = await db.select().from(stageTemplatesTable).orderBy(stageTemplatesTable.name);
  const result = await Promise.all(rows.map(async (tpl) => {
    const stages = await db.select().from(stagesTable).where(eq(stagesTable.templateId, tpl.id));
    return { ...tpl, stageCount: stages.length };
  }));
  res.json(result);
});

router.post("/templates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, description, isDefault, stages } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  // Validate
  if (stages) {
    for (const s of stages) {
      if (!s.fields) continue;
      for (const f of s.fields) {
        const allowed = WIDGET_COMPAT[f.baseType] ?? [];
        if (!allowed.includes(f.widget)) { res.status(400).json({ error: `Widget '${f.widget}' incompatible with baseType '${f.baseType}'` }); return; }
        if (["single-choice", "multi-choice"].includes(f.baseType) && (!f.options || f.options.length === 0)) {
          res.status(400).json({ error: `Choice field '${f.name}' must have at least one option` }); return;
        }
      }
    }
  }

  if (isDefault) {
    await db.update(stageTemplatesTable).set({ isDefault: false });
  }

  const [tpl] = await db.insert(stageTemplatesTable).values({ name, description: description ?? null, isDefault: isDefault ?? false }).returning();

  if (stages) {
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const [stage] = await db.insert(stagesTable).values({ templateId: tpl.id, name: s.name, description: s.description ?? null, orderIndex: i, progressBaseline: s.progressBaseline ?? 0, category: s.category }).returning();
      if (s.fields) {
        for (let j = 0; j < s.fields.length; j++) {
          const f = s.fields[j];
          await db.insert(stageFieldsTable).values({ stageId: stage.id, name: f.name, baseType: f.baseType, widget: f.widget, required: f.required ?? false, position: j, options: f.options ?? null, config: f.config ?? null });
        }
      }
    }
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

  const { name, description, isDefault, stages } = req.body;

  // Validate
  if (stages) {
    for (const s of stages) {
      if (!s.fields) continue;
      for (const f of s.fields) {
        const allowed = WIDGET_COMPAT[f.baseType] ?? [];
        if (!allowed.includes(f.widget)) { res.status(400).json({ error: `Widget '${f.widget}' incompatible with baseType '${f.baseType}'` }); return; }
        if (["single-choice", "multi-choice"].includes(f.baseType) && (!f.options || f.options.length === 0)) {
          res.status(400).json({ error: `Choice field '${f.name}' must have at least one option` }); return;
        }
      }
    }
  }

  if (isDefault) {
    await db.update(stageTemplatesTable).set({ isDefault: false }).where(ne(stageTemplatesTable.id, templateId));
  }

  await db.update(stageTemplatesTable).set({ name: name ?? existing.name, description: description ?? existing.description, isDefault: isDefault ?? existing.isDefault }).where(eq(stageTemplatesTable.id, templateId));

  // Replace stages/fields
  if (stages) {
    await db.delete(stagesTable).where(eq(stagesTable.templateId, templateId));
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const [stage] = await db.insert(stagesTable).values({ templateId, name: s.name, description: s.description ?? null, orderIndex: i, progressBaseline: s.progressBaseline ?? 0, category: s.category }).returning();
      if (s.fields) {
        for (let j = 0; j < s.fields.length; j++) {
          const f = s.fields[j];
          await db.insert(stageFieldsTable).values({ stageId: stage.id, name: f.name, baseType: f.baseType, widget: f.widget, required: f.required ?? false, position: j, options: f.options ?? null, config: f.config ?? null });
        }
      }
    }
  }

  await logAudit({ action: "template.updated", actorId: req.user!.userId, targetType: "template", targetId: templateId });
  const full = await getFullTemplate(templateId);
  res.json(full);
});

router.delete("/templates/:templateId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const templateId = parseId(req.params.templateId);
  const [existing] = await db.select().from(stageTemplatesTable).where(eq(stageTemplatesTable.id, templateId));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(stageTemplatesTable).where(eq(stageTemplatesTable.id, templateId));
  await logAudit({ action: "template.deleted", actorId: req.user!.userId, targetType: "template", targetId: templateId });
  res.sendStatus(204);
});

export default router;

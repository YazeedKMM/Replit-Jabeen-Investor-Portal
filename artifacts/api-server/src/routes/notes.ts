import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { internalNotesTable, projectsTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, MANAGER_ROLES } from "../middlewares/requireAuth";
import { createNotifications, getManagerIds } from "../lib/notifications";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw);
}

router.get("/projects/:projectId/notes", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const projectId = parseId(req.params.projectId);
  const rows = await db.select().from(internalNotesTable).where(eq(internalNotesTable.projectId, projectId)).orderBy(desc(internalNotesTable.createdAt));
  const enriched = await Promise.all(rows.map(async (note) => {
    const [author] = await db.select({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, role: usersTable.role, companyName: usersTable.companyName }).from(usersTable).where(eq(usersTable.id, note.authorId));
    return { ...note, author };
  }));
  res.json(enriched);
});

router.post("/projects/:projectId/notes", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const projectId = parseId(req.params.projectId);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const { body } = req.body;
  if (!body || body.length < 1 || body.length > 4000) { res.status(400).json({ error: "Note body must be 1–4000 characters" }); return; }

  const [note] = await db.insert(internalNotesTable).values({
    projectId,
    authorId: req.user!.userId,
    body,
  }).returning();

  // Notify other managers
  const managerIds = await getManagerIds();
  await createNotifications({
    kind: "internal-note",
    recipientIds: managerIds,
    actorId: req.user!.userId,
    projectId,
    title: `Internal note added to ${project.name}`,
    body: body.slice(0, 100),
  });

  const [author] = await db.select({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, role: usersTable.role, companyName: usersTable.companyName }).from(usersTable).where(eq(usersTable.id, note.authorId));
  res.status(201).json({ ...note, author });
});

export default router;

import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { messagesTable, projectsTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, PRIVILEGED_ROLES } from "../middlewares/requireAuth";
import { createNotifications, getManagerIds } from "../lib/notifications";
import { parseId } from "../lib/http";

const router: IRouter = Router();

async function getProjectScoped(projectId: number, userId: number, role: string) {
  const [p] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!p) return null;
  const isPrivileged = (PRIVILEGED_ROLES as readonly string[]).includes(role);
  if (!isPrivileged && p.investorId !== userId) return null;
  return p;
}

router.get("/projects/:projectId/messages", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const projectId = parseId(req.params.projectId);
  const project = await getProjectScoped(projectId, req.user!.userId, req.user!.role);
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const rows = await db.select().from(messagesTable).where(eq(messagesTable.projectId, projectId)).orderBy(asc(messagesTable.createdAt));
  const enriched = await Promise.all(rows.map(async (msg) => {
    const [author] = await db.select({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, role: usersTable.role, companyName: usersTable.companyName }).from(usersTable).where(eq(usersTable.id, msg.authorId));
    return { ...msg, author };
  }));
  res.json(enriched);
});

router.post("/projects/:projectId/messages", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const projectId = parseId(req.params.projectId);
  if (req.user!.role === "top-management") { res.status(403).json({ error: "Top Management cannot post messages" }); return; }

  const project = await getProjectScoped(projectId, req.user!.userId, req.user!.role);
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const { body } = req.body;
  if (!body || body.length < 1 || body.length > 4000) { res.status(400).json({ error: "Message body must be 1–4000 characters" }); return; }

  const [msg] = await db.insert(messagesTable).values({
    projectId,
    authorId: req.user!.userId,
    authorRole: req.user!.role,
    body,
  }).returning();

  // Notify: investor + managers, excluding author
  const managerIds = await getManagerIds();
  const recipientIds = [...managerIds];
  if (project.investorId) recipientIds.push(project.investorId);
  await createNotifications({
    kind: "message",
    recipientIds,
    actorId: req.user!.userId,
    projectId,
    title: `New message in ${project.name}`,
    body: body.slice(0, 100),
  });

  const [author] = await db.select({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, role: usersTable.role, companyName: usersTable.companyName }).from(usersTable).where(eq(usersTable.id, msg.authorId));
  res.status(201).json({ ...msg, author });
});

export default router;

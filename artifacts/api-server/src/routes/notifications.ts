import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { notificationsTable, projectsTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw);
}

async function enrichNotification(n: typeof notificationsTable.$inferSelect) {
  let projectName = null;
  if (n.projectId) {
    const [p] = await db.select({ name: projectsTable.name }).from(projectsTable).where(eq(projectsTable.id, n.projectId));
    projectName = p?.name ?? null;
  }
  let actorName = null;
  if (n.actorId) {
    const [a] = await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, n.actorId));
    actorName = a?.fullName ?? null;
  }
  return { ...n, projectName, actorName };
}

router.get("/notifications", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const rows = await db.select().from(notificationsTable).where(eq(notificationsTable.recipientId, req.user!.userId)).orderBy(desc(notificationsTable.createdAt));
  const enriched = await Promise.all(rows.map(enrichNotification));
  res.json(enriched);
});

router.get("/notifications/unread-count", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const rows = await db.select().from(notificationsTable).where(
    and(eq(notificationsTable.recipientId, req.user!.userId), eq(notificationsTable.read, false))
  );
  res.json({ count: rows.length });
});

router.patch("/notifications/read-all", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  await db.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.recipientId, req.user!.userId));
  res.sendStatus(204);
});

router.patch("/notifications/:notificationId/read", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const notifId = parseId(req.params.notificationId);
  const [n] = await db.select().from(notificationsTable).where(and(eq(notificationsTable.id, notifId), eq(notificationsTable.recipientId, req.user!.userId)));
  if (!n) { res.status(404).json({ error: "Not found" }); return; }
  const [updated] = await db.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.id, notifId)).returning();
  const enriched = await enrichNotification(updated);
  res.json(enriched);
});

export default router;

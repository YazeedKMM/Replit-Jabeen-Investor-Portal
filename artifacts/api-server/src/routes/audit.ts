import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { auditLogTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, ADMIN_ROLE } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/audit-log", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const page = Math.max(1, parseInt((req.query.page as string) ?? "1"));
  const limit = Math.min(500, Math.max(1, parseInt((req.query.limit as string) ?? "50")));
  const offset = (page - 1) * limit;

  const rows = await db.select().from(auditLogTable).orderBy(desc(auditLogTable.createdAt)).limit(limit).offset(offset);
  const total = (await db.select().from(auditLogTable)).length;

  const entries = await Promise.all(rows.map(async (entry) => {
    let actorName = null;
    if (entry.actorId) {
      const [u] = await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, entry.actorId));
      actorName = u?.fullName ?? null;
    }
    return { ...entry, actorName };
  }));

  res.json({ entries, total, page, limit });
});

export default router;

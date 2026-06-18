import { Router, type IRouter } from "express";
import { eq, and, ilike, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, projectsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, MANAGER_ROLES, ADMIN_ROLE, PRIVILEGED_ROLES } from "../middlewares/requireAuth";
import { hashPassword, generateOtpPassword } from "../lib/auth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw);
}

function safeUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash: _ph, ...rest } = user;
  return rest;
}

router.get("/users", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { search, role } = req.query as Record<string, string>;

  let rows = await db.select().from(usersTable).orderBy(usersTable.fullName);
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter((u) =>
      u.fullName.toLowerCase().includes(s) ||
      u.email.toLowerCase().includes(s) ||
      u.companyName.toLowerCase().includes(s)
    );
  }
  if (role) rows = rows.filter((u) => u.role === role);
  res.json(rows.map(safeUser));
});

router.post("/users", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const actorRole = req.user!.role;
  if (!(MANAGER_ROLES as readonly string[]).includes(actorRole)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { fullName, email, companyName, title, phone, role } = req.body;
  if (!fullName || !email || !companyName || !role) { res.status(400).json({ error: "Missing required fields" }); return; }

  // PMs can only create investors
  if (actorRole === "project-manager" && role !== "investor") {
    res.status(403).json({ error: "Project Managers can only create Investor accounts" }); return;
  }

  const normalized = email.toLowerCase().trim();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalized));
  if (existing) { res.status(409).json({ error: "Email already registered" }); return; }

  const temporaryPassword = generateOtpPassword();
  const passwordHash = hashPassword(temporaryPassword);

  const [user] = await db.insert(usersTable).values({
    email: normalized, fullName, companyName, title: title ?? null, phone: phone ?? null, role, passwordHash,
  }).returning();

  await logAudit({ action: "user.created", actorId: req.user!.userId, targetType: "user", targetId: user.id, detail: `role:${role}` });
  res.status(201).json({ user: safeUser(user), temporaryPassword });
});

router.get("/users/:userId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const userId = parseId(req.params.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(safeUser(user));
});

router.patch("/users/:userId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const userId = parseId(req.params.userId);
  if (userId === req.user!.userId) { res.status(400).json({ error: "Cannot modify your own account" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  const { fullName, companyName, title, phone, role, active } = req.body;
  const updates: Record<string, unknown> = {};
  if (fullName !== undefined) updates.fullName = fullName;
  if (companyName !== undefined) updates.companyName = companyName;
  if (title !== undefined) updates.title = title;
  if (phone !== undefined) updates.phone = phone;
  if (role !== undefined) updates.role = role;
  if (active !== undefined) updates.active = active;

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  await logAudit({ action: "user.updated", actorId: req.user!.userId, targetType: "user", targetId: userId });
  res.json(safeUser(updated));
});

router.delete("/users/:userId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const userId = parseId(req.params.userId);
  if (userId === req.user!.userId) { res.status(400).json({ error: "Cannot delete your own account" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  // Unassign projects
  await db.update(projectsTable).set({ investorId: null }).where(eq(projectsTable.investorId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  await logAudit({ action: "user.deleted", actorId: req.user!.userId, targetType: "user", targetId: userId });
  res.sendStatus(204);
});

router.post("/users/:userId/reset-password", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const userId = parseId(req.params.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  const temporaryPassword = generateOtpPassword();
  await db.update(usersTable).set({ passwordHash: hashPassword(temporaryPassword) }).where(eq(usersTable.id, userId));
  await logAudit({ action: "user.password-reset", actorId: req.user!.userId, targetType: "user", targetId: userId });
  res.json({ temporaryPassword });
});

export default router;

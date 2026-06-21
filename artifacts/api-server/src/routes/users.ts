import { Router, type IRouter } from "express";
import { eq, and, ilike, or } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, projectsTable, refreshTokensTable, userCitiesTable, citiesTable } from "@workspace/db";
import { requireAuth, invalidateAccountStatusCache, type AuthenticatedRequest, MANAGER_ROLES, ADMIN_ROLE, PRIVILEGED_ROLES } from "../middlewares/requireAuth";
import { hashPassword, generateOtpPassword } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { parseId } from "../lib/http";

const router: IRouter = Router();

const VALID_ROLES = ["investor", "top-management", "project-manager", "administrator"];
const VALID_STATUSES = ["pending", "active", "inactive"];

function safeUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash: _ph, mfaSecret: _ms, mfaRecoveryCodes: _mrc, ...rest } = user;
  return rest;
}

router.get("/users", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { search, role, status } = req.query as Record<string, string>;

  // Filter in SQL rather than loading the whole table into memory.
  const conditions = [];
  if (search) {
    const like = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conditions.push(or(
      ilike(usersTable.fullName, like),
      ilike(usersTable.email, like),
      ilike(usersTable.companyName, like),
    ));
  }
  if (role) {
    if (!VALID_ROLES.includes(role)) { res.json([]); return; }
    conditions.push(eq(usersTable.role, role as typeof usersTable.$inferSelect["role"]));
  }
  if (status) {
    if (!VALID_STATUSES.includes(status)) { res.json([]); return; }
    conditions.push(eq(usersTable.status, status as typeof usersTable.$inferSelect["status"]));
  }

  const rows = conditions.length
    ? await db.select().from(usersTable).where(and(...conditions)).orderBy(usersTable.fullName)
    : await db.select().from(usersTable).orderBy(usersTable.fullName);
  res.json(rows.map(safeUser));
});

router.post("/users", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const actorRole = req.user!.role;
  if (!(MANAGER_ROLES as readonly string[]).includes(actorRole)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { fullName, email, companyName, title, phone, role } = req.body;
  if (!fullName || !email || !companyName || !role) { res.status(400).json({ error: "Missing required fields" }); return; }

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
    status: "active",
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

  const { fullName, companyName, title, phone, role, status } = req.body;
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` }); return;
  }
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }); return;
  }
  const updates: Record<string, unknown> = {};
  if (fullName !== undefined) updates.fullName = fullName;
  if (companyName !== undefined) updates.companyName = companyName;
  if (title !== undefined) updates.title = title;
  if (phone !== undefined) updates.phone = phone;
  if (role !== undefined) updates.role = role;
  if (status !== undefined) updates.status = status;

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  // Invalidate the per-request account status cache so requireAuth re-validates on next request
  if (status !== undefined) invalidateAccountStatusCache(userId);
  await logAudit({ action: "user.updated", actorId: req.user!.userId, targetType: "user", targetId: userId });
  res.json(safeUser(updated));
});

router.delete("/users/:userId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const userId = parseId(req.params.userId);
  if (userId === req.user!.userId) { res.status(400).json({ error: "Cannot delete your own account" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(projectsTable).set({ investorId: null }).where(eq(projectsTable.investorId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  // Invalidate the account status cache for the deleted user immediately
  invalidateAccountStatusCache(userId);
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

// POST /users/:userId/mfa/reset — Admin resets a user's MFA (clears secret, disables MFA)
router.post("/users/:userId/mfa/reset", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const userId = parseId(req.params.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(usersTable)
    .set({ mfaSecret: null, mfaEnabled: false, mfaRecoveryCodes: null })
    .where(eq(usersTable.id, userId));

  await logAudit({
    action: "user.mfa-reset",
    actorId: req.user!.userId,
    targetType: "user",
    targetId: userId,
    detail: `mfa reset for user ${user.email}`,
  });

  res.sendStatus(204);
});

// GET /users/:userId/cities — Admin: list cities assigned to a user (project manager)
router.get("/users/:userId/cities", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const userId = parseId(req.params.userId);
  const rows = await db.select({ cityId: userCitiesTable.cityId }).from(userCitiesTable).where(eq(userCitiesTable.userId, userId));
  res.json(rows.map((r) => r.cityId));
});

// PUT /users/:userId/cities — Admin: replace assigned cities for a project manager
router.put("/users/:userId/cities", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const userId = parseId(req.params.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.role !== "project-manager") { res.status(400).json({ error: "City assignment applies to project managers only" }); return; }

  const cityIds: unknown = req.body?.cityIds;
  if (!Array.isArray(cityIds) || cityIds.some((id) => typeof id !== "number")) {
    res.status(400).json({ error: "cityIds must be an array of numbers" }); return;
  }
  // Validate all city ids exist.
  for (const id of cityIds) {
    const [c] = await db.select({ id: citiesTable.id }).from(citiesTable).where(eq(citiesTable.id, id));
    if (!c) { res.status(400).json({ error: `Unknown city id ${id}` }); return; }
  }
  await db.delete(userCitiesTable).where(eq(userCitiesTable.userId, userId));
  if (cityIds.length) await db.insert(userCitiesTable).values(cityIds.map((cityId) => ({ userId, cityId })));
  await logAudit({ action: "user.cities-updated", actorId: req.user!.userId, targetType: "user", targetId: userId });
  res.json(cityIds);
});

// POST /users/:userId/activate
router.post("/users/:userId/activate", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const actorRole = req.user!.role;
  if (!(MANAGER_ROLES as readonly string[]).includes(actorRole)) { res.status(403).json({ error: "Forbidden" }); return; }

  const userId = parseId(req.params.userId);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }

  if (user.status !== "pending") {
    res.status(400).json({ error: "Account is not pending activation" }); return;
  }

  if (actorRole === "project-manager" && user.role !== "investor") {
    res.status(403).json({ error: "Project Managers can only activate Investor accounts" }); return;
  }

  const { projectId } = (req.body ?? {}) as { projectId?: number };

  let project: typeof projectsTable.$inferSelect | undefined;
  if (projectId) {
    if (user.role !== "investor") {
      res.status(400).json({ error: "Project linking is only available for Investor accounts" }); return;
    }
    const [found] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
    if (!found) { res.status(404).json({ error: "Project not found" }); return; }
    project = found;
  }

  const [activated] = await db.update(usersTable)
    .set({ status: "active" })
    .where(eq(usersTable.id, userId))
    .returning();

  if (project) {
    await db.update(projectsTable).set({ investorId: userId }).where(eq(projectsTable.id, project.id));
  }

  await db.delete(refreshTokensTable).where(eq(refreshTokensTable.userId, userId));
  // Invalidate the per-request account status cache so requireAuth re-validates on next request
  invalidateAccountStatusCache(userId);

  await logAudit({
    action: "user.activated",
    actorId: req.user!.userId,
    targetType: "user",
    targetId: userId,
    detail: projectId ? `linked-to-project:${projectId}` : undefined,
  });

  res.json(safeUser(activated));
});

export default router;

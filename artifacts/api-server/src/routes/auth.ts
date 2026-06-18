import { Router, type IRouter } from "express";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, refreshTokensTable } from "@workspace/db";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  generateOtpPassword,
  refreshTokenExpiresAt,
  verifyAccessToken,
} from "../lib/auth";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router: IRouter = Router();

const COOKIE_NAME = "jabeen_refresh";
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Simple in-memory throttle: key = "ip:email" => { count, resetAt }
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function checkThrottle(key: string, maxAttempts = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  if (entry.count > maxAttempts) return false;
  return true;
}

function setRefreshCookie(res: import("express").Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: REFRESH_TTL_MS,
  });
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const { fullName, email, password, companyName, title, phone } = req.body;
  if (!fullName || !email || !password || !companyName) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  if (password.length < 8 || password.length > 128) {
    res.status(400).json({ error: "Password must be 8–128 characters" });
    return;
  }
  const normalized = email.toLowerCase().trim();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalized));
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }
  const passwordHash = hashPassword(password);
  const [user] = await db.insert(usersTable).values({
    email: normalized,
    fullName,
    companyName,
    title: title ?? null,
    phone: phone ?? null,
    role: "investor",
    passwordHash,
  }).returning();
  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  const refreshToken = generateRefreshToken();
  await db.insert(refreshTokensTable).values({ userId: user.id, token: refreshToken, expiresAt: refreshTokenExpiresAt() });
  setRefreshCookie(res, refreshToken);
  const { passwordHash: _ph, ...safeUser } = user;
  res.status(201).json({ accessToken, user: safeUser });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Missing email or password" });
    return;
  }
  const ip = req.ip ?? "unknown";
  const throttleKey = `${ip}:${email.toLowerCase()}`;
  if (!checkThrottle(throttleKey)) {
    res.status(429).json({ error: "Too many login attempts. Please try again later." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  if (!user.active) {
    res.status(403).json({ error: "Account deactivated" });
    return;
  }
  if (!verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  const refreshToken = generateRefreshToken();
  await db.insert(refreshTokensTable).values({ userId: user.id, token: refreshToken, expiresAt: refreshTokenExpiresAt() });
  setRefreshCookie(res, refreshToken);
  const { passwordHash: _ph, ...safeUser } = user;
  res.json({ accessToken, user: safeUser });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const token = (req as import("express").Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
  if (token) {
    await db.delete(refreshTokensTable).where(eq(refreshTokensTable.token, token));
  }
  res.clearCookie(COOKIE_NAME);
  res.sendStatus(204);
});

router.post("/auth/refresh", async (req, res): Promise<void> => {
  const token = (req as import("express").Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "No refresh token" });
    return;
  }
  const [stored] = await db
    .select()
    .from(refreshTokensTable)
    .where(and(eq(refreshTokensTable.token, token), gt(refreshTokensTable.expiresAt, new Date())));
  if (!stored) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, stored.userId));
  if (!user || !user.active) {
    res.status(401).json({ error: "Account not found or deactivated" });
    return;
  }
  // Rotate token
  await db.delete(refreshTokensTable).where(eq(refreshTokensTable.id, stored.id));
  const newRefreshToken = generateRefreshToken();
  await db.insert(refreshTokensTable).values({ userId: user.id, token: newRefreshToken, expiresAt: refreshTokenExpiresAt() });
  setRefreshCookie(res, newRefreshToken);
  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  const { passwordHash: _ph, ...safeUser } = user;
  res.json({ accessToken, user: safeUser });
});

router.get("/auth/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  const { passwordHash: _ph, ...safeUser } = user;
  res.json(safeUser);
});

router.patch("/auth/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { fullName, title, companyName, phone } = req.body;
  const updates: Record<string, unknown> = {};
  if (fullName !== undefined) updates.fullName = fullName;
  if (title !== undefined) updates.title = title;
  if (companyName !== undefined) updates.companyName = companyName;
  if (phone !== undefined) updates.phone = phone;
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.userId)).returning();
  const { passwordHash: _ph, ...safeUser } = user;
  res.json(safeUser);
});

export default router;

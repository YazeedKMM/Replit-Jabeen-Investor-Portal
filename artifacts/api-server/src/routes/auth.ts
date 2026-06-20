import { Router, type IRouter } from "express";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, refreshTokensTable } from "@workspace/db";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signMfaStepToken,
  generateRefreshToken,
  generateOtpPassword,
  refreshTokenExpiresAt,
  verifyAccessToken,
} from "../lib/auth";
import { requireAuth, requireMfaStepToken, type AuthenticatedRequest, MFA_REQUIRED_ROLES } from "../middlewares/requireAuth";
import {
  generateTotpSecret,
  verifyTotpCode,
  generateRecoveryCodes,
  verifyAndConsumeRecoveryCode,
  generateQrCodeDataUrl,
  encryptMfaData,
} from "../lib/mfa";

const router: IRouter = Router();

const COOKIE_NAME = "jabeen_refresh";
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

function safeUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash: _ph, mfaSecret: _ms, mfaRecoveryCodes: _mrc, ...rest } = user;
  return rest;
}

async function issueFullSession(
  res: import("express").Response,
  user: typeof usersTable.$inferSelect,
) {
  const accessToken = signAccessToken({ userId: user.id, role: user.role, status: user.status });
  const refreshToken = generateRefreshToken();
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: refreshTokenExpiresAt(),
  });
  setRefreshCookie(res, refreshToken);
  return { accessToken, user: safeUser(user) };
}

// ────────────────────────────────────────────────────────────────
// REGISTER
// ────────────────────────────────────────────────────────────────
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
    status: "pending",
    passwordHash,
  }).returning();
  const result = await issueFullSession(res, user);
  res.status(201).json(result);
});

// ────────────────────────────────────────────────────────────────
// LOGIN
// ────────────────────────────────────────────────────────────────
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
  if (user.status === "inactive") {
    res.status(403).json({ error: "Account deactivated" });
    return;
  }
  if (!verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  // MFA enrolled — require TOTP before issuing session
  if (user.mfaEnabled && user.mfaSecret) {
    const mfaToken = signMfaStepToken({ userId: user.id, role: user.role, status: user.status, mfaPending: true });
    res.json({ mfaRequired: true, mfaToken });
    return;
  }

  // Privileged account without MFA enrolled — require enrollment
  if ((MFA_REQUIRED_ROLES as readonly string[]).includes(user.role) && !user.mfaEnabled) {
    const mfaToken = signMfaStepToken({ userId: user.id, role: user.role, status: user.status, mfaSetupRequired: true });
    res.json({ mfaSetupRequired: true, mfaToken });
    return;
  }

  // Non-privileged account, no MFA — issue full session
  const result = await issueFullSession(res, user);
  res.json(result);
});

// ────────────────────────────────────────────────────────────────
// MFA — VERIFY (TOTP code after password, for enrolled users)
// ────────────────────────────────────────────────────────────────
router.post("/auth/mfa/verify", requireMfaStepToken, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.user?.mfaPending) {
    res.status(403).json({ error: "Invalid MFA token state" });
    return;
  }
  const { code, recoveryCode } = req.body as { code?: string; recoveryCode?: string };
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId));
  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    res.status(400).json({ error: "MFA not configured" });
    return;
  }

  let valid = false;

  if (recoveryCode && user.mfaRecoveryCodes) {
    const result = verifyAndConsumeRecoveryCode(user.mfaRecoveryCodes, recoveryCode);
    if (result.valid) {
      valid = true;
      await db.update(usersTable)
        .set({ mfaRecoveryCodes: result.updatedEncryptedCodes })
        .where(eq(usersTable.id, user.id));
    }
  } else if (code) {
    valid = verifyTotpCode(user.mfaSecret, code);
  }

  if (!valid) {
    res.status(401).json({ error: "Invalid code" });
    return;
  }

  const sessionResult = await issueFullSession(res, user);
  res.json(sessionResult);
});

// ────────────────────────────────────────────────────────────────
// MFA — SETUP (generate secret, return QR code + URI)
// ────────────────────────────────────────────────────────────────
router.post("/auth/mfa/setup", requireMfaStepToken, async (req: AuthenticatedRequest, res): Promise<void> => {
  // Accept both mfaSetupRequired tokens AND fully-authenticated users (for optional enrollment)
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Don't let a fresh setup silently disable an already-active enrollment (which
  // would break the user's working authenticator). Require an explicit disable
  // (non-privileged) or admin reset before re-enrolling.
  if (user.mfaEnabled) {
    res.status(409).json({ error: "MFA is already enabled. Disable it (or ask an administrator to reset it) before re-enrolling." });
    return;
  }

  const { secret, otpauthUri } = generateTotpSecret(user.email);
  const encryptedSecret = encryptMfaData(secret);
  const qrCode = await generateQrCodeDataUrl(otpauthUri);

  // Store pending secret (mfaEnabled stays false until verify-setup)
  await db.update(usersTable)
    .set({ mfaSecret: encryptedSecret, mfaEnabled: false })
    .where(eq(usersTable.id, user.id));

  res.json({ otpauthUri, qrCode, secret });
});

// ────────────────────────────────────────────────────────────────
// MFA — VERIFY SETUP (confirm first code, activate MFA, return recovery codes)
// ────────────────────────────────────────────────────────────────
router.post("/auth/mfa/verify-setup", requireMfaStepToken, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { code } = req.body as { code: string };
  if (!code) {
    res.status(400).json({ error: "TOTP code is required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId));
  if (!user || !user.mfaSecret) {
    res.status(400).json({ error: "MFA setup not initiated" });
    return;
  }
  if (!verifyTotpCode(user.mfaSecret, code)) {
    res.status(401).json({ error: "Invalid TOTP code" });
    return;
  }

  const { plainCodes, encryptedCodes } = generateRecoveryCodes();
  await db.update(usersTable)
    .set({ mfaEnabled: true, mfaRecoveryCodes: encryptedCodes })
    .where(eq(usersTable.id, user.id));

  // Reload fresh user from DB then issue full session
  const [updatedUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  const sessionResult = await issueFullSession(res, updatedUser!);
  res.json({ ...sessionResult, recoveryCodes: plainCodes });
});

// ────────────────────────────────────────────────────────────────
// MFA — DISABLE (remove MFA for authenticated user, non-privileged only)
// Privileged accounts cannot self-disable; they need admin reset.
// ────────────────────────────────────────────────────────────────
router.delete("/auth/mfa", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if ((MFA_REQUIRED_ROLES as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Privileged accounts cannot self-disable MFA. Contact an administrator." });
    return;
  }
  await db.update(usersTable)
    .set({ mfaSecret: null, mfaEnabled: false, mfaRecoveryCodes: null })
    .where(eq(usersTable.id, req.user!.userId));
  res.sendStatus(204);
});

// ────────────────────────────────────────────────────────────────
// LOGOUT / REFRESH / ME (unchanged structure, updated safeUser)
// ────────────────────────────────────────────────────────────────
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
  if (!user || user.status === "inactive") {
    res.status(401).json({ error: "Account not found or deactivated" });
    return;
  }
  if (user.status === "pending") {
    res.status(403).json({ error: "Account pending activation", code: "ACCOUNT_PENDING" });
    return;
  }
  await db.delete(refreshTokensTable).where(eq(refreshTokensTable.id, stored.id));
  const newRefreshToken = generateRefreshToken();
  await db.insert(refreshTokensTable).values({ userId: user.id, token: newRefreshToken, expiresAt: refreshTokenExpiresAt() });
  setRefreshCookie(res, newRefreshToken);
  const accessToken = signAccessToken({ userId: user.id, role: user.role, status: user.status });
  res.json({ accessToken, user: safeUser(user) });
});

router.get("/auth/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (!user) { res.status(404).json({ error: "Not found" }); return; }
  res.json(safeUser(user));
});

router.patch("/auth/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { fullName, title, companyName, phone } = req.body;
  const updates: Record<string, unknown> = {};
  if (fullName !== undefined) updates.fullName = fullName;
  if (title !== undefined) updates.title = title;
  if (companyName !== undefined) updates.companyName = companyName;
  if (phone !== undefined) updates.phone = phone;
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.user!.userId)).returning();
  res.json(safeUser(user));
});

export default router;

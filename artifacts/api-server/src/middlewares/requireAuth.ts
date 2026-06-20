import { type Request, type Response, type NextFunction } from "express";
import { verifyAccessToken, type JwtPayload } from "../lib/auth";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// In-memory cache for account status checks — 30-second TTL
// Keyed by userId, stores { active: boolean, expiresAt: number }
const accountStatusCache = new Map<number, { active: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

async function isAccountActive(userId: number): Promise<boolean> {
  const now = Date.now();
  const cached = accountStatusCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.active;
  }
  const [row] = await db
    .select({ id: usersTable.id, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const active = !!row && row.status === "active";
  accountStatusCache.set(userId, { active, expiresAt: now + CACHE_TTL_MS });
  return active;
}

/** Invalidate the cached account status for a user (call after status changes). */
export function invalidateAccountStatusCache(userId: number): void {
  accountStatusCache.delete(userId);
}

/**
 * Standard auth middleware. Validates the Bearer token and attaches req.user.
 * Rejects tokens that are still pending MFA completion (mfaPending or mfaSetupRequired),
 * so all existing protected routes automatically require a fully-authenticated session.
 * Also performs a live DB lookup (with 30s cache) to reject deactivated accounts immediately.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  if (payload.mfaPending) {
    res.status(403).json({ error: "TOTP verification required", code: "MFA_REQUIRED" });
    return;
  }
  if (payload.mfaSetupRequired) {
    res.status(403).json({ error: "MFA enrollment required before accessing the portal", code: "MFA_SETUP_REQUIRED" });
    return;
  }
  req.user = payload;
  // DB re-validation: confirm the account is still active before allowing the request through
  isAccountActive(payload.userId).then((active) => {
    if (!active) {
      res.status(401).json({ error: "Account deactivated or not found" });
      return;
    }
    next();
  }).catch((err: unknown) => {
    // Fail-closed: if the DB check itself errors, reject the request rather than allow it through
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: "Service temporarily unavailable — please retry", detail: msg });
  });
}

/**
 * Middleware for MFA endpoints that require either a mfaPending or mfaSetupRequired token.
 * Used for TOTP verify, setup, and verify-setup endpoints.
 */
export function requireMfaStepToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.user = payload;
  next();
}

export function requireActiveAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.status === "pending") {
    res.status(403).json({ error: "Account pending activation" });
    return;
  }
  if (req.user.status === "inactive") {
    res.status(403).json({ error: "Account deactivated" });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export const MANAGER_ROLES = ["project-manager", "administrator"] as const;
export const PRIVILEGED_ROLES = ["top-management", "project-manager", "administrator"] as const;
export const ADMIN_ROLE = ["administrator"] as const;
export const MFA_REQUIRED_ROLES = ["project-manager", "administrator"] as const;

import { type Request, type Response, type NextFunction } from "express";
import { verifyAccessToken, type JwtPayload } from "../lib/auth";

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

/**
 * Standard auth middleware. Validates the Bearer token and attaches req.user.
 * Rejects tokens that are still pending MFA completion (mfaPending or mfaSetupRequired),
 * so all existing protected routes automatically require a fully-authenticated session.
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
  next();
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

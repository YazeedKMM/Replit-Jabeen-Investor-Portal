import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.SESSION_SECRET ?? "jabeen-dev-secret-change-in-prod";
const ACCESS_TOKEN_LIFETIME = 30 * 60; // 30 minutes
const REFRESH_TOKEN_LIFETIME = 7 * 24 * 60 * 60; // 7 days
const MFA_TOKEN_LIFETIME = 5 * 60; // 5 minutes — short-lived, used only to complete MFA step

export interface JwtPayload {
  userId: number;
  role: string;
  status: string;
  /** Set to true when password was verified but TOTP not yet verified */
  mfaPending?: boolean;
  /** Set to true for privileged accounts that have not yet enrolled in MFA */
  mfaSetupRequired?: boolean;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_LIFETIME });
}

/** Signs a short-lived token used only for the MFA completion step */
export function signMfaStepToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: MFA_TOKEN_LIFETIME });
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function generateOtpPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => chars[b % chars.length])
    .join("");
}

export function refreshTokenExpiresAt(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_LIFETIME * 1000);
}

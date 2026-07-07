import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db";
import { requireAuth, requireActiveAccount, type AuthenticatedRequest, MANAGER_ROLES } from "../middlewares/requireAuth";
import { UpdateBrandingBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const BRANDING_KEY = "branding";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();
const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const LOGO_MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const LOGO_EXT: Record<string, string> = {
  "image/svg+xml": ".svg",
  "image/png": ".png",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
};

const logoStorage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    cb(null, "brand-" + crypto.randomBytes(16).toString("hex") + (LOGO_EXT[file.mimetype] ?? ""));
  },
});
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: LOGO_MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (LOGO_EXT[file.mimetype]) cb(null, true);
    else cb(new Error("Unsupported logo type — use SVG, PNG, or ICO"));
  },
});

/** SVG has no magic bytes (it's XML text); PNG/ICO are checked via file-type. */
async function validateLogoSignature(filePath: string, declaredMime: string): Promise<boolean> {
  const buf = Buffer.alloc(4100);
  const fd = fs.openSync(filePath, "r");
  const bytesRead = fs.readSync(fd, buf, 0, 4100, 0);
  fs.closeSync(fd);
  const head = buf.subarray(0, bytesRead);
  if (declaredMime === "image/svg+xml") {
    const text = head.toString("utf8").trimStart().toLowerCase();
    return text.startsWith("<svg") || text.startsWith("<?xml");
  }
  const detected = await fileTypeFromBuffer(head);
  if (!detected) return false;
  if (declaredMime === "image/png") return detected.mime === "image/png";
  return detected.mime === "image/x-icon" || detected.mime === "image/vnd.microsoft.icon";
}

export const DEFAULT_BRANDING = {
  name: "JABEEN",
  colors: {
    primary: "oklch(0.46 0.09 118)",
    secondary: "oklch(0.40 0.06 195)",
    accent: "oklch(0.34 0.09 45)",
    success: "oklch(0.53 0.12 155)",
    warning: "oklch(0.56 0.11 75)",
    error: "oklch(0.53 0.19 27)",
  },
  logos: { light: null as string | null, dark: null as string | null, favicon: null as string | null },
};

export async function readBranding() {
  const [row] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, BRANDING_KEY));
  if (!row) return DEFAULT_BRANDING;
  try {
    const parsed = JSON.parse(row.value);
    // Shallow-merge so configs saved before a future schema addition still work.
    return {
      ...DEFAULT_BRANDING,
      ...parsed,
      colors: { ...DEFAULT_BRANDING.colors, ...(parsed.colors ?? {}) },
      logos: { ...DEFAULT_BRANDING.logos, ...(parsed.logos ?? {}) },
    };
  } catch {
    logger.warn({ key: BRANDING_KEY }, "Corrupted branding row — falling back to defaults");
    return DEFAULT_BRANDING;
  }
}

// Public: the login page themes itself before auth.
router.get("/branding", async (_req, res): Promise<void> => {
  res.json(await readBranding());
});

router.put("/branding", requireAuth, requireActiveAccount, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const parsed = UpdateBrandingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid branding payload", detail: parsed.error.issues }); return; }
  const value = JSON.stringify(parsed.data);
  await db.insert(systemSettingsTable).values({ key: BRANDING_KEY, value }).onConflictDoUpdate({ target: systemSettingsTable.key, set: { value } });
  res.json(await readBranding());
});

router.post(
  "/branding/logo",
  requireAuth,
  requireActiveAccount,
  (req: AuthenticatedRequest, res, next) => {
    if (!(MANAGER_ROLES as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
    next();
  },
  uploadLogo.single("file"),
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const filePath = path.join(uploadsDir, req.file.filename);
    const ok = await validateLogoSignature(filePath, req.file.mimetype);
    if (!ok) {
      fs.unlinkSync(filePath);
      res.status(415).json({ error: "File signature does not match the declared content type. Upload rejected." });
      return;
    }
    res.status(201).json({ key: req.file.filename });
  },
);

const LOGO_KEY_RE = /^brand-[a-f0-9]{32}\.(svg|png|ico)$/;
const LOGO_CONTENT_TYPE: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Public: logos render on the pre-auth login page and as the favicon.
router.get("/branding/logo/:key", (req, res): void => {
  const key = req.params.key;
  if (!LOGO_KEY_RE.test(key)) { res.status(404).json({ error: "Not found" }); return; }
  const filePath = path.join(uploadsDir, key);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "Not found" }); return; }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", LOGO_CONTENT_TYPE[path.extname(key)]);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.sendFile(filePath);
});

export default router;

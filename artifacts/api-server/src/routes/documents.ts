import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";
import { db } from "@workspace/db";
import { documentsTable, projectsTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, PRIVILEGED_ROLES, ADMIN_ROLE } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";
import { parseId } from "../lib/http";

const router: IRouter = Router();

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();
const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

// Magic-byte MIME types mapped to our allowed set
// file-type may detect application/zip for docx/xlsx; we map those appropriately
const MAGIC_BYTE_ALLOW: Set<string> = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  // MS Word legacy
  "application/x-cfb", // .doc
  // OOXML formats — reported as zip by file-type; we accept zip when the declared MIME is OOXML
  "application/zip",
  // Plain text and CSV have no magic bytes — file-type returns undefined; allow through
]);

const SCANNER_URL = process.env.MALWARE_SCANNER_URL;
if (!SCANNER_URL) {
  // Log once at startup that no scanner is configured
  process.nextTick(() => {
    console.warn("[security] MALWARE_SCANNER_URL is not configured — malware scanning is disabled for document uploads (stub only)");
  });
}

async function validateMagicBytes(filePath: string, declaredMime: string): Promise<boolean> {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(4100);
  const bytesRead = fs.readSync(fd, buf, 0, 4100, 0);
  fs.closeSync(fd);

  const detected = await fileTypeFromBuffer(buf.subarray(0, bytesRead));

  if (!detected) {
    // No magic bytes detected — allow plain text/CSV which have no signatures
    return declaredMime === "text/plain" || declaredMime === "text/csv";
  }

  // For OOXML types (docx, xlsx), file-type reports application/zip; allow when declared MIME is OOXML
  const isOoxml = declaredMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || declaredMime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (isOoxml && detected.mime === "application/zip") return true;

  // For legacy .doc/.xls, file-type reports application/x-cfb (Compound File Binary)
  const isCfb = declaredMime === "application/msword" || declaredMime === "application/vnd.ms-excel";
  if (isCfb && detected.mime === "application/x-cfb") return true;

  // For other types, detected MIME must match declared MIME exactly
  return detected.mime === declaredMime;
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, _file, cb) => {
    cb(null, crypto.randomBytes(24).toString("hex"));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error("Unsupported file type"));
  },
});

async function getProjectScoped(projectId: number, userId: number, role: string) {
  const [p] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!p) return null;
  const isPrivileged = (PRIVILEGED_ROLES as readonly string[]).includes(role);
  if (!isPrivileged && p.investorId !== userId) return null;
  return p;
}

async function enrichDocument(doc: typeof documentsTable.$inferSelect) {
  const [uploader] = await db.select({ id: usersTable.id, fullName: usersTable.fullName, email: usersTable.email, role: usersTable.role, companyName: usersTable.companyName }).from(usersTable).where(eq(usersTable.id, doc.uploaderId));
  return { ...doc, uploader };
}

router.get("/projects/:projectId/documents", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const projectId = parseId(req.params.projectId);
  const project = await getProjectScoped(projectId, req.user!.userId, req.user!.role);
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  const rows = await db.select().from(documentsTable).where(eq(documentsTable.projectId, projectId)).orderBy(desc(documentsTable.createdAt));
  const enriched = await Promise.all(rows.map(enrichDocument));
  res.json(enriched);
});

router.post("/projects/:projectId/documents", requireAuth, upload.single("file"), async (req: AuthenticatedRequest, res): Promise<void> => {
  // Top Management is read-only — it can view/download but never upload.
  if (req.user!.role === "top-management") { res.status(403).json({ error: "Top Management cannot upload documents" }); return; }
  const projectId = parseId(req.params.projectId);
  const project = await getProjectScoped(projectId, req.user!.userId, req.user!.role);
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const filePath = path.join(uploadsDir, req.file.filename);

  // Magic-byte validation: verify the file's actual signature matches the declared MIME type
  const signatureValid = await validateMagicBytes(filePath, req.file.mimetype);
  if (!signatureValid) {
    fs.unlinkSync(filePath);
    res.status(415).json({ error: "File signature does not match the declared content type. Upload rejected." });
    return;
  }

  // Malware scanning stub: warn if no scanner is configured, skip scan
  if (!SCANNER_URL) {
    req.log?.warn({ file: req.file.filename }, "Malware scanning skipped — no MALWARE_SCANNER_URL configured");
  }

  const updateId = req.body.updateId ? parseInt(req.body.updateId) : null;
  const [doc] = await db.insert(documentsTable).values({
    projectId,
    updateId,
    fileName: req.file.originalname,
    contentType: req.file.mimetype,
    size: req.file.size,
    storageKey: req.file.filename,
    uploaderId: req.user!.userId,
  }).returning();
  const enriched = await enrichDocument(doc);
  res.status(201).json(enriched);
});

router.get("/documents", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select().from(documentsTable).orderBy(desc(documentsTable.createdAt));
  const enriched = await Promise.all(rows.map(enrichDocument));
  res.json(enriched);
});

router.delete("/documents/:documentId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const docId = parseId(req.params.documentId);
  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }
  const filePath = path.join(uploadsDir, doc.storageKey);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  await db.delete(documentsTable).where(eq(documentsTable.id, docId));
  await logAudit({ action: "document.deleted", actorId: req.user!.userId, targetType: "document", targetId: docId });
  res.sendStatus(204);
});

router.get("/documents/:documentId/download", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const docId = parseId(req.params.documentId);
  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, docId));
  if (!doc) { res.status(404).json({ error: "Not found" }); return; }

  // Scope check
  const project = await getProjectScoped(doc.projectId, req.user!.userId, req.user!.role);
  if (!project) { res.status(404).json({ error: "Not found" }); return; }

  const filePath = path.join(uploadsDir, doc.storageKey);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "File not found" }); return; }
  res.setHeader("Content-Disposition", `attachment; filename="${doc.fileName}"`);
  res.setHeader("Content-Type", doc.contentType);
  res.sendFile(filePath);
});

export default router;

import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db } from "@workspace/db";
import { documentsTable, projectsTable, usersTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, PRIVILEGED_ROLES, ADMIN_ROLE } from "../middlewares/requireAuth";
import { logAudit } from "../lib/audit";

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

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw);
}

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
  const projectId = parseId(req.params.projectId);
  const project = await getProjectScoped(projectId, req.user!.userId, req.user!.role);
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

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

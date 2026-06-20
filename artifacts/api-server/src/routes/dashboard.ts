import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { projectsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, PRIVILEGED_ROLES } from "../middlewares/requireAuth";
import { deriveProjectStatus } from "../lib/status";
import { getStatusThresholds } from "../lib/settings-cache";

const router: IRouter = Router();

router.get("/dashboard", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(PRIVILEGED_ROLES as readonly string[]).includes(req.user!.role)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [{ stalledDays, delayedDays }, projects] = await Promise.all([
    getStatusThresholds(),
    db.select().from(projectsTable),
  ]);

  const statuses = await Promise.all(projects.map(async (p) => {
    const status = await deriveProjectStatus(p, stalledDays, delayedDays);
    return { project: p, status };
  }));

  const total = projects.length;
  const complete = statuses.filter((s) => s.status === "complete").length;
  const inProgress = statuses.filter((s) => s.status === "on-track" || s.status === "delayed").length;
  const needsAttention = statuses.filter((s) => s.status === "stalled" || s.project.attentionFlag).length;

  const byStatusMap: Record<string, number> = {};
  for (const s of statuses) {
    byStatusMap[s.status] = (byStatusMap[s.status] ?? 0) + 1;
  }
  const byStatus = Object.entries(byStatusMap).map(([status, count]) => ({ status, count }));

  const bySectorMap: Record<string, number> = {};
  for (const p of projects) {
    bySectorMap[p.sector] = (bySectorMap[p.sector] ?? 0) + 1;
  }
  const bySector = Object.entries(bySectorMap).map(([sector, count]) => ({ sector, count }));

  const recentUpdates = statuses
    .filter((s) => s.project.lastUpdateAt)
    .sort((a, b) => new Date(b.project.lastUpdateAt!).getTime() - new Date(a.project.lastUpdateAt!).getTime())
    .slice(0, 5)
    .map((s) => ({ ...s.project, derivedStatus: s.status }));

  res.json({ total, complete, inProgress, needsAttention, byStatus, bySector, recentUpdates });
});

export default router;

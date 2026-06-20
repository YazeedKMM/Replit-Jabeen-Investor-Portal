import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest, ADMIN_ROLE } from "../middlewares/requireAuth";
import { invalidateSettingsCache } from "../lib/settings-cache";

const router: IRouter = Router();

const DEFAULTS: Record<string, string> = {
  stalledThresholdDays: "45",
  delayedThresholdDays: "30",
  outOfBandNotificationsEnabled: "false",
  loginThrottleMaxAttempts: "10",
  loginThrottleWindowSeconds: "60",
};

async function getSettingsMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(systemSettingsTable);
  const map = { ...DEFAULTS };
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

function mapToResponse(map: Record<string, string>) {
  return {
    stalledThresholdDays: parseInt(map.stalledThresholdDays),
    delayedThresholdDays: parseInt(map.delayedThresholdDays),
    outOfBandNotificationsEnabled: map.outOfBandNotificationsEnabled === "true",
    loginThrottleMaxAttempts: parseInt(map.loginThrottleMaxAttempts),
    loginThrottleWindowSeconds: parseInt(map.loginThrottleWindowSeconds),
  };
}

router.get("/settings", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const map = await getSettingsMap();
  res.json(mapToResponse(map));
});

router.patch("/settings", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!(ADMIN_ROLE as readonly string[]).includes(req.user!.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const allowed = ["stalledThresholdDays", "delayedThresholdDays", "outOfBandNotificationsEnabled", "loginThrottleMaxAttempts", "loginThrottleWindowSeconds"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      const value = String(req.body[key]);
      const [existing] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, key));
      if (existing) {
        await db.update(systemSettingsTable).set({ value }).where(eq(systemSettingsTable.key, key));
      } else {
        await db.insert(systemSettingsTable).values({ key, value });
      }
    }
  }

  invalidateSettingsCache();
  const map = await getSettingsMap();
  res.json(mapToResponse(map));
});

export default router;

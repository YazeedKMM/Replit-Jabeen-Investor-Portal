import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db";
import { requireAuth, requireActiveAccount, type AuthenticatedRequest, MANAGER_ROLES } from "../middlewares/requireAuth";
import { UpdateBrandingBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const BRANDING_KEY = "branding";

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

export default router;

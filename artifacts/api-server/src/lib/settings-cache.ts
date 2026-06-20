import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db";

export interface StatusThresholds {
  stalledDays: number;
  delayedDays: number;
}

const DEFAULTS: StatusThresholds = {
  stalledDays: 45,
  delayedDays: 30,
};

const CACHE_TTL_MS = 60_000;

let cached: StatusThresholds | null = null;
let cachedAt = 0;

export async function getStatusThresholds(): Promise<StatusThresholds> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const rows = await db.select().from(systemSettingsTable);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  const stalledDays = map.stalledThresholdDays ? parseInt(map.stalledThresholdDays, 10) : DEFAULTS.stalledDays;
  const delayedDays = map.delayedThresholdDays ? parseInt(map.delayedThresholdDays, 10) : DEFAULTS.delayedDays;

  cached = {
    stalledDays: Number.isFinite(stalledDays) ? stalledDays : DEFAULTS.stalledDays,
    delayedDays: Number.isFinite(delayedDays) ? delayedDays : DEFAULTS.delayedDays,
  };
  cachedAt = now;
  return cached;
}

export function invalidateSettingsCache(): void {
  cached = null;
  cachedAt = 0;
}

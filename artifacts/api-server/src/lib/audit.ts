import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";

interface AuditOpts {
  action: string;
  actorId?: number;
  targetType?: string;
  targetId?: number;
  detail?: string;
}

export async function logAudit(opts: AuditOpts): Promise<void> {
  await db.insert(auditLogTable).values({
    action: opts.action,
    actorId: opts.actorId,
    targetType: opts.targetType,
    targetId: opts.targetId,
    detail: opts.detail,
  });
}

/**
 * Log an audit entry only if no matching (action + actor + target) entry was
 * recorded within `windowMs`. Prevents high-frequency events (e.g. viewing
 * investor contact details on every project page load) from flooding the log
 * while still producing a periodic compliance trail.
 */
export async function logAuditDeduped(opts: AuditOpts, windowMs = 60 * 60 * 1000): Promise<void> {
  const since = new Date(Date.now() - windowMs);
  const [existing] = await db
    .select({ id: auditLogTable.id })
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.action, opts.action),
        opts.actorId != null ? eq(auditLogTable.actorId, opts.actorId) : undefined,
        opts.targetId != null ? eq(auditLogTable.targetId, opts.targetId) : undefined,
        gt(auditLogTable.createdAt, since),
      ),
    )
    .limit(1);
  if (existing) return;
  await logAudit(opts);
}

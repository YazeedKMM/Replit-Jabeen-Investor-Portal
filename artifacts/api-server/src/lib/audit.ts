import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db";

export async function logAudit(opts: {
  action: string;
  actorId?: number;
  targetType?: string;
  targetId?: number;
  detail?: string;
}): Promise<void> {
  await db.insert(auditLogTable).values({
    action: opts.action,
    actorId: opts.actorId,
    targetType: opts.targetType,
    targetId: opts.targetId,
    detail: opts.detail,
  });
}

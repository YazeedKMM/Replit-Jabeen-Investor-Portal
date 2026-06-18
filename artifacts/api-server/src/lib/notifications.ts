import { db } from "@workspace/db";
import { notificationsTable, usersTable } from "@workspace/db";
import { eq, and, ne, inArray } from "drizzle-orm";

type NotificationKind = "message" | "internal-note" | "update-submitted" | "update-approved" | "update-rejected";

export async function createNotifications(opts: {
  kind: NotificationKind;
  recipientIds: number[];
  actorId: number;
  projectId?: number;
  title: string;
  body?: string;
}): Promise<void> {
  const deduped = [...new Set(opts.recipientIds.filter((id) => id !== opts.actorId))];
  if (deduped.length === 0) return;
  await db.insert(notificationsTable).values(
    deduped.map((recipientId) => ({
      recipientId,
      kind: opts.kind,
      projectId: opts.projectId,
      actorId: opts.actorId,
      title: opts.title,
      body: opts.body,
    }))
  );
}

export async function getManagerIds(): Promise<number[]> {
  const managers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        inArray(usersTable.role, ["project-manager", "administrator"]),
        eq(usersTable.active, true)
      )
    );
  return managers.map((m) => m.id);
}

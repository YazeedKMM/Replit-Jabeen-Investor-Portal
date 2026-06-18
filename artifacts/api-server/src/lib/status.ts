import { db } from "@workspace/db";
import { statusUpdatesTable, stagesTable, documentsTable } from "@workspace/db";
import { and, eq, lt, desc } from "drizzle-orm";

export type DerivedStatus = "on-track" | "delayed" | "stalled" | "complete";

export async function deriveProjectStatus(project: {
  id: number;
  currentStageId: number | null;
  lastUpdateAt: Date | null;
}, stalledDays = 45, delayedDays = 30): Promise<DerivedStatus> {
  // Fetch current stage
  if (!project.currentStageId) {
    return "stalled";
  }

  const [stage] = await db
    .select({ category: stagesTable.category })
    .from(stagesTable)
    .where(eq(stagesTable.id, project.currentStageId));

  if (!stage) return "stalled";

  // Complete
  if (stage.category === "complete") return "complete";

  // Stalled: on-hold category
  if (stage.category === "on-hold") return "stalled";

  const now = new Date();
  const lastUpdate = project.lastUpdateAt;

  // Stalled: no update ever or > stalledDays
  if (!lastUpdate) return "stalled";
  const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceUpdate > stalledDays) return "stalled";

  // Delayed: > delayedDays
  if (daysSinceUpdate > delayedDays) return "delayed";

  // Delayed: no approved current-stage document
  const [doc] = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .innerJoin(statusUpdatesTable, eq(documentsTable.updateId, statusUpdatesTable.id))
    .where(
      and(
        eq(documentsTable.projectId, project.id),
        eq(statusUpdatesTable.reviewStatus, "approved"),
        eq(statusUpdatesTable.targetStageId, project.currentStageId)
      )
    )
    .limit(1);

  if (!doc) return "delayed";

  return "on-track";
}

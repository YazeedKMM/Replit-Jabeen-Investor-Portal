import { db } from "@workspace/db";
import { statusUpdatesTable, stagesTable, documentsTable, stageFieldsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export type DerivedStatus = "on-track" | "delayed" | "stalled" | "complete";

export async function deriveProjectStatus(project: {
  id: number;
  currentStageId: number | null;
  lastUpdateAt: Date | null;
}, stalledDays = 45, delayedDays = 30): Promise<DerivedStatus> {
  if (!project.currentStageId) {
    return "stalled";
  }

  const [stage] = await db
    .select({ category: stagesTable.category })
    .from(stagesTable)
    .where(eq(stagesTable.id, project.currentStageId));

  if (!stage) return "stalled";

  if (stage.category === "complete") return "complete";

  if (stage.category === "on-hold") return "stalled";

  const now = new Date();
  const lastUpdate = project.lastUpdateAt;

  if (!lastUpdate) return "stalled";
  const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceUpdate > stalledDays) return "stalled";

  if (daysSinceUpdate > delayedDays) return "delayed";

  // Delayed: no approved current-stage document.
  // FR-DOC-010: only applies when the stage defines at least one required
  // file or image field. Stages with no such field are never delayed for
  // the missing-document reason.
  const requiredDocFields = await db
    .select({ baseType: stageFieldsTable.baseType })
    .from(stageFieldsTable)
    .where(
      and(
        eq(stageFieldsTable.stageId, project.currentStageId),
        eq(stageFieldsTable.required, true)
      )
    );

  const stageRequiresDoc = requiredDocFields.some(
    (f) => f.baseType === "file" || f.baseType === "image"
  );

  if (!stageRequiresDoc) {
    return "on-track";
  }

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

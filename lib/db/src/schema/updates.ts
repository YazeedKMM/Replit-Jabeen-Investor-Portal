import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { projectsTable } from "./projects";
import { stagesTable, stageFieldsTable } from "./templates";

export const reviewStatusEnum = pgEnum("review_status", ["pending", "approved", "rejected"]);

export const statusUpdatesTable = pgTable("status_updates", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => usersTable.id),
  sourceStageId: integer("source_stage_id").references(() => stagesTable.id, { onDelete: "set null" }),
  targetStageId: integer("target_stage_id").notNull().references(() => stagesTable.id),
  constructionPct: integer("construction_pct").notNull(),
  note: text("note"),
  reviewStatus: reviewStatusEnum("review_status").notNull().default("pending"),
  reviewerId: integer("reviewer_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  documentId: integer("document_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fieldValuesTable = pgTable("field_values", {
  id: serial("id").primaryKey(),
  updateId: integer("update_id").notNull().references(() => statusUpdatesTable.id, { onDelete: "cascade" }),
  fieldId: integer("field_id").notNull().references(() => stageFieldsTable.id),
  textValue: text("text_value"),
  numValue: text("num_value"),
  dateValue: text("date_value"),
  boolValue: text("bool_value"),
  choiceValue: text("choice_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StatusUpdate = typeof statusUpdatesTable.$inferSelect;
export type FieldValue = typeof fieldValuesTable.$inferSelect;

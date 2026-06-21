import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { stageTemplatesTable, stagesTable } from "./templates";
import { citiesTable } from "./cities";
import { projectCategoriesTable } from "./project_categories";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cityId: integer("city_id").notNull().references(() => citiesTable.id, { onDelete: "restrict" }),
  categoryId: integer("category_id").notNull().references(() => projectCategoriesTable.id, { onDelete: "restrict" }),
  agreementNumber: text("agreement_number").notNull().unique(),
  plotNumber: text("plot_number"),
  notes: text("notes"),
  constructionPct: integer("construction_pct").notNull().default(0),
  attentionFlag: boolean("attention_flag").notNull().default(false),
  lastUpdateAt: timestamp("last_update_at", { withTimezone: true }),
  pipelineId: integer("pipeline_id").references(() => stageTemplatesTable.id, { onDelete: "set null" }),
  currentStageId: integer("current_stage_id").references(() => stagesTable.id, { onDelete: "set null" }),
  investorId: integer("investor_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
});

export type Project = typeof projectsTable.$inferSelect;

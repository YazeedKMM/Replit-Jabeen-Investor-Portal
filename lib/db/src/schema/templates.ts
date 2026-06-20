import { pgTable, serial, text, boolean, integer, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";

export const stageCategoryEnum = pgEnum("stage_category", ["on-hold", "active", "complete"]);
export const fieldBaseTypeEnum = pgEnum("field_base_type", ["text", "number", "date", "boolean", "file", "image", "single-choice", "multi-choice"]);
export const fieldWidgetEnum = pgEnum("field_widget", ["single-line", "multi-line", "email", "telephone", "number", "date", "checkbox", "toggle", "file-upload", "single-photo", "photo-gallery", "drop-list", "list-box", "radio", "checkbox-list"]);

export const stageTemplatesTable = pgTable("stage_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").notNull().default(false),
  parentTemplateId: integer("parent_template_id").references((): import("drizzle-orm/pg-core").AnyPgColumn => stageTemplatesTable.id, { onDelete: "set null" }),
  versionNumber: integer("version_number").notNull().default(1),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  wasEverAssigned: boolean("was_ever_assigned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stagesTable = pgTable("stages", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => stageTemplatesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").notNull(),
  progressBaseline: integer("progress_baseline").notNull().default(0),
  category: stageCategoryEnum("category").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stageFieldsTable = pgTable("stage_fields", {
  id: serial("id").primaryKey(),
  stageId: integer("stage_id").notNull().references(() => stagesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  baseType: fieldBaseTypeEnum("base_type").notNull(),
  widget: fieldWidgetEnum("widget").notNull(),
  required: boolean("required").notNull().default(false),
  position: integer("position").notNull(),
  options: text("options").array(),
  config: jsonb("config"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StageTemplate = typeof stageTemplatesTable.$inferSelect;
export type Stage = typeof stagesTable.$inferSelect;
export type StageField = typeof stageFieldsTable.$inferSelect;

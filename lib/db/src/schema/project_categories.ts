import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const projectCategoriesTable = pgTable("project_categories", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectCategory = typeof projectCategoriesTable.$inferSelect;

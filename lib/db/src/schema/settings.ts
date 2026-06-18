import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const systemSettingsTable = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

export type SystemSetting = typeof systemSettingsTable.$inferSelect;

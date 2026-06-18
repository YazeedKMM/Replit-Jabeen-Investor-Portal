import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: integer("target_id"),
  actorId: integer("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLogEntry = typeof auditLogTable.$inferSelect;

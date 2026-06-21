import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { citiesTable } from "./cities";

export const userCitiesTable = pgTable("user_cities", {
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  cityId: integer("city_id").notNull().references(() => citiesTable.id, { onDelete: "cascade" }),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.cityId] }),
}));

export type UserCity = typeof userCitiesTable.$inferSelect;

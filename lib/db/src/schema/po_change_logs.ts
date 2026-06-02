import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { projectsPoTable } from "./projects_po";

export const poChangeLogsTable = pgTable("po_change_logs", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").references(() => projectsPoTable.id, { onDelete: "set null" }),
  noPo: text("no_po").notNull(),
  action: text("action").notNull(),
  changes: jsonb("changes").notNull().$type<Record<string, { before: unknown; after: unknown }>>(),
  changedByUserId: integer("changed_by_user_id").references(() => usersTable.id),
  changedByName: text("changed_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PoChangeLog = typeof poChangeLogsTable.$inferSelect;

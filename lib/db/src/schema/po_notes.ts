import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { projectsPoTable } from "./projects_po";
import { usersTable } from "./users";

export const poNotesTable = pgTable("po_notes", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").notNull().references(() => projectsPoTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  userName: text("user_name").notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { projectsPoTable } from "./projects_po";
import { usersTable } from "./users";

export const poInternalCommentsTable = pgTable("po_internal_comments", {
  id: serial("id").primaryKey(),
  poId: integer("po_id")
    .notNull()
    .references(() => projectsPoTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  userName: text("user_name").notNull(),
  userRole: text("user_role"),
  userDepartment: text("user_department"),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PoInternalComment = typeof poInternalCommentsTable.$inferSelect;

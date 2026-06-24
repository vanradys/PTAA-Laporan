import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { todoTaskChecklistTable, todoTasksTable } from "./todo_tasks";
import { usersTable } from "./users";

export const todoChecklistHistoryTable = pgTable("todo_checklist_history", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id")
    .notNull()
    .references(() => todoTasksTable.id, { onDelete: "cascade" }),
  checklistId: integer("checklist_id").references(() => todoTaskChecklistTable.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  previousText: text("previous_text"),
  nextText: text("next_text"),
  previousCompleted: integer("previous_completed"),
  nextCompleted: integer("next_completed"),
  actorUserId: integer("actor_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  actorName: text("actor_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TodoChecklistHistory = typeof todoChecklistHistoryTable.$inferSelect;

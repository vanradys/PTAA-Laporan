import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { dailyTasksTable } from "./daily_tasks";

export const assignedDailyTasksTable = pgTable("assigned_daily_tasks", {
  id: serial("id").primaryKey(),
  assigneeUserId: integer("assignee_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  assignedByUserId: integer("assigned_by_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  assignedByName: text("assigned_by_name").notNull(),
  assignedByRole: text("assigned_by_role").notNull(),
  title: text("title").notNull(),
  project: text("project"),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  createdTaskId: integer("created_task_id").references(() => dailyTasksTable.id, {
    onDelete: "set null",
  }),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AssignedDailyTask = typeof assignedDailyTasksTable.$inferSelect;

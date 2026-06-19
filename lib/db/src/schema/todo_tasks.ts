import { pgTable, text, serial, integer, date, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const todoTasksTable = pgTable("todo_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull().default("personal"),
  startDate: date("start_date").notNull(),
  dueDate: date("due_date").notNull(),
  priority: text("priority").notNull().default("Sedang"),
  status: text("status").notNull().default("Belum Mulai"),
  createdByUserId: integer("created_by_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdByName: text("created_by_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const todoTaskAssigneesTable = pgTable("todo_task_assignees", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => todoTasksTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  userName: text("user_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const todoTaskChecklistTable = pgTable("todo_task_checklist", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => todoTasksTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  isCompleted: integer("is_completed").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const todoTaskCommentsTable = pgTable("todo_task_comments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => todoTasksTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  userName: text("user_name").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

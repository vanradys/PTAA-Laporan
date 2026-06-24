import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dailyReportsTable } from "./daily_reports";
import { usersTable } from "./users";

export const dailyTasksTable = pgTable("daily_tasks", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => dailyReportsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  project: text("project"),
  deadline: text("deadline"),
  completionInputType: text("completion_input_type"),
  completionValue: text("completion_value"),
  progress: integer("progress").notNull().default(0),
  status: text("status").notNull().default("belum_mulai"),
  notes: text("notes"),
  reviewStatus: text("review_status"),
  reviewComment: text("review_comment"),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => usersTable.id),
  reviewedByName: text("reviewed_by_name"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  correctedAt: timestamp("corrected_at", { withTimezone: true }),
  revisionSourceTaskId: integer("revision_source_task_id"),
  revisionWorkTaskId: integer("revision_work_task_id"),
  editCount: integer("edit_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDailyTaskSchema = createInsertSchema(dailyTasksTable).omit({
  id: true,
  editCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDailyTask = z.infer<typeof insertDailyTaskSchema>;
export type DailyTask = typeof dailyTasksTable.$inferSelect;

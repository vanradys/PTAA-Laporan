import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { dailyReportsTable } from "./daily_reports";

export const dailyTasksTable = pgTable("daily_tasks", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => dailyReportsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  project: text("project"),
  deadline: date("deadline"),
  progress: integer("progress").notNull().default(0),
  status: text("status").notNull().default("belum_mulai"),
  notes: text("notes"),
  editCount: integer("edit_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDailyTaskSchema = createInsertSchema(dailyTasksTable).omit({
  id: true,
  editCount: true,
  createdAt: true,
});

export type InsertDailyTask = z.infer<typeof insertDailyTaskSchema>;
export type DailyTask = typeof dailyTasksTable.$inferSelect;

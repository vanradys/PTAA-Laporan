import { pgTable, text, serial, integer, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const dailyReportReminderLogsTable = pgTable("daily_report_reminder_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reportDate: date("report_date").notNull(),
  reminderType: text("reminder_type").notNull().default("daily_report"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  sentBy: integer("sent_by").references(() => usersTable.id),
}, (table) => [
  uniqueIndex("daily_report_reminder_logs_user_date_type_unique").on(
    table.userId,
    table.reportDate,
    table.reminderType,
  ),
]);

export const insertDailyReportReminderLogSchema = createInsertSchema(dailyReportReminderLogsTable).omit({
  id: true,
  sentAt: true,
});

export type InsertDailyReportReminderLog = z.infer<typeof insertDailyReportReminderLogSchema>;
export type DailyReportReminderLog = typeof dailyReportReminderLogsTable.$inferSelect;

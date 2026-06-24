import {
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { attendanceMappingsTable } from "./attendance";
import { usersTable } from "./users";

export const attendanceManualCorrectionsTable = pgTable(
  "attendance_manual_corrections",
  {
    id: serial("id").primaryKey(),
    mappingId: integer("mapping_id")
      .notNull()
      .references(() => attendanceMappingsTable.id, { onDelete: "cascade" }),
    workDate: date("work_date").notNull(),
    dailyStatus: text("daily_status").notNull(),
    notes: text("notes"),
    overtimeProduction: numeric("overtime_production", {
      precision: 10,
      scale: 2,
    }),
    overtimeOffice: numeric("overtime_office", { precision: 10, scale: 2 }),
    updatedByUserId: integer("updated_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_manual_corrections_mapping_date_unique").on(
      table.mappingId,
      table.workDate,
    ),
  ],
);

export type AttendanceManualCorrection =
  typeof attendanceManualCorrectionsTable.$inferSelect;

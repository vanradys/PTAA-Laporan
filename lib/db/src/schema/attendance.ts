import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { notificationsTable } from "./notifications";

export const attendanceMappingsTable = pgTable(
  "attendance_mappings",
  {
    id: serial("id").primaryKey(),
    machineName: text("machine_name").notNull(),
    displayName: text("display_name").notNull(),
    userId: integer("user_id").references(() => usersTable.id),
    employeeType: text("employee_type").notNull().default("Produksi"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_mappings_machine_name_unique").on(table.machineName),
    uniqueIndex("attendance_mappings_user_id_unique").on(table.userId),
  ],
);

export const attendanceImportBatchesTable = pgTable("attendance_import_batches", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  sheetName: text("sheet_name").notNull(),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  status: text("status").notNull().default("preview"),
  totalRows: integer("total_rows").notNull().default(0),
  validRows: integer("valid_rows").notNull().default(0),
  invalidRows: integer("invalid_rows").notNull().default(0),
  mappedNames: integer("mapped_names").notNull().default(0),
  unmappedNames: integer("unmapped_names").notNull().default(0),
  uploadedBy: integer("uploaded_by").notNull().references(() => usersTable.id),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendanceImportRowsTable = pgTable("attendance_import_rows", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => attendanceImportBatchesTable.id, { onDelete: "cascade" }),
  rowNumber: integer("row_number").notNull(),
  rawData: jsonb("raw_data").notNull(),
  machineName: text("machine_name"),
  scanDate: date("scan_date"),
  scanTime: text("scan_time"),
  department: text("department"),
  position: text("position"),
  office: text("office"),
  verification: text("verification"),
  ioType: text("io_type"),
  workcode: text("workcode"),
  serialNumber: text("serial_number"),
  machine: text("machine"),
  isValid: boolean("is_valid").notNull().default(false),
  validationErrors: jsonb("validation_errors").notNull().default([]),
});

export const attendanceScansTable = pgTable("attendance_scans", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => attendanceImportBatchesTable.id, { onDelete: "cascade" }),
  importRowId: integer("import_row_id").notNull().references(() => attendanceImportRowsTable.id, { onDelete: "cascade" }),
  mappingId: integer("mapping_id").notNull().references(() => attendanceMappingsTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  machineName: text("machine_name").notNull(),
  displayName: text("display_name").notNull(),
  employeeType: text("employee_type").notNull(),
  department: text("department"),
  scanDate: date("scan_date").notNull(),
  scanTime: text("scan_time").notNull(),
  workDate: date("work_date").notNull(),
  ioType: text("io_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("attendance_scans_import_row_unique").on(table.importRowId),
]);

export const attendanceDailyTable = pgTable("attendance_daily", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => attendanceImportBatchesTable.id, { onDelete: "cascade" }),
  mappingId: integer("mapping_id").notNull().references(() => attendanceMappingsTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  machineName: text("machine_name").notNull(),
  displayName: text("display_name").notNull(),
  employeeType: text("employee_type").notNull(),
  department: text("department"),
  workDate: date("work_date").notNull(),
  clockIn: text("clock_in"),
  clockOut: text("clock_out"),
  totalScans: integer("total_scans").notNull().default(0),
  isHoliday: boolean("is_holiday").notNull().default(false),
  isLate: boolean("is_late").notNull().default(false),
  overtimeProduction: numeric("overtime_production", { precision: 10, scale: 2 }).notNull().default("0"),
  overtimeOffice: numeric("overtime_office", { precision: 10, scale: 2 }).notNull().default("0"),
  entryStatus: text("entry_status").notNull(),
  exitStatus: text("exit_status").notNull(),
  dailyStatus: text("daily_status").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("attendance_daily_batch_mapping_date_unique").on(
    table.batchId,
    table.mappingId,
    table.workDate,
  ),
]);

export const attendanceHolidaysTable = pgTable("attendance_holidays", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  name: text("name").notNull(),
  holidayType: text("holiday_type").notNull().default("Lainnya"),
  source: text("source").notNull().default("Manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendanceSettingsTable = pgTable("attendance_settings", {
  id: integer("id").primaryKey().default(1),
  safeMax: integer("safe_max").notNull().default(2),
  warningMax: integer("warning_max").notNull().default(4),
  autoIndonesiaHoliday: boolean("auto_indonesia_holiday").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendanceNotificationLogsTable = pgTable(
  "attendance_notification_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: text("status").notNull(),
    notificationId: integer("notification_id").references(() => notificationsTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_notification_period_unique").on(
      table.userId,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

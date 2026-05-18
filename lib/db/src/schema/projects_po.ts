import { pgTable, text, serial, integer, date, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { departmentsTable } from "./departments";

export const projectsPoTable = pgTable("projects_po", {
  id: serial("id").primaryKey(),
  noPo: text("no_po").notNull(),
  namaProject: text("nama_project").notNull(),
  customer: text("customer"),
  tanggalPoMasuk: date("tanggal_po_masuk").notNull(),
  targetPenyelesaian: date("target_penyelesaian"),
  deadline: date("deadline").notNull(),
  picUserId: integer("pic_user_id").references(() => usersTable.id),
  departmentId: integer("department_id").references(() => departmentsTable.id),
  status: text("status").notNull().default("belum_mulai"),
  progress: integer("progress").notNull().default(0),
  catatan: text("catatan"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedByUserId: integer("closed_by_user_id").references(() => usersTable.id),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  notified14Days: boolean("notified_14_days").notNull().default(false),
  notified7Days: boolean("notified_7_days").notNull().default(false),
  notifiedPassed: boolean("notified_passed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProjectsPoSchema = createInsertSchema(projectsPoTable).omit({
  id: true, closedAt: true, closedByUserId: true, createdAt: true, updatedAt: true,
  notified14Days: true, notified7Days: true, notifiedPassed: true,
});
export type InsertProjectsPo = z.infer<typeof insertProjectsPoSchema>;
export type ProjectsPo = typeof projectsPoTable.$inferSelect;

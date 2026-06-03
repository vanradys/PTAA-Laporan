import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { projectsPoTable } from "./projects_po";

export const customerTrackingCommentsTable = pgTable("customer_tracking_comments", {
  id: serial("id").primaryKey(),
  poId: integer("po_id")
    .notNull()
    .references(() => projectsPoTable.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  isRead: boolean("is_read").notNull().default(false),
});

export type CustomerTrackingComment =
  typeof customerTrackingCommentsTable.$inferSelect;

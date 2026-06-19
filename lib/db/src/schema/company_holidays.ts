import { pgTable, text, date, timestamp } from "drizzle-orm/pg-core";

export const companyHolidaysTable = pgTable("company_holidays", {
  date: date("date").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

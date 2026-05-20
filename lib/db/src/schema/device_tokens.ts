import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const deviceTokensTable = pgTable("device_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  platform: text("platform").notNull().default("web"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("device_tokens_token_unique").on(table.token),
]);

export const insertDeviceTokenSchema = createInsertSchema(deviceTokensTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDeviceToken = z.infer<typeof insertDeviceTokenSchema>;
export type DeviceToken = typeof deviceTokensTable.$inferSelect;

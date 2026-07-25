import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  telegramId: text('telegramId').primaryKey(),
  username: text('username'),
  currentChapter: integer('currentChapter').notNull().default(1),
  deliveryHour: integer('deliveryHour'),
  isPaused: boolean('isPaused').notNull().default(false),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

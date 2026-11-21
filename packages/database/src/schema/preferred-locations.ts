import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users.js';

export const preferredLocations = sqliteTable(
  'preferred_locations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    city: text('city'),
    region: text('region'),
    country: text('country').notNull(),
    priority: integer('priority').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [index('preferred_locations_user_priority_idx').on(table.userId, table.priority)],
);

export type PreferredLocation = typeof preferredLocations.$inferSelect;
export type NewPreferredLocation = typeof preferredLocations.$inferInsert;

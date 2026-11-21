import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users.js';

export const preferredRoles = sqliteTable(
  'preferred_roles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    category: text('category', {
      enum: ['frontend', 'backend', 'full_stack', 'software_engineering', 'devops', 'data', 'mobile', 'other'],
    }),
    seniority: text('seniority', {
      enum: ['internship', 'entry_level', 'junior', 'mid_level', 'senior', 'any'],
    })
      .notNull()
      .default('any'),
    priority: integer('priority').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [index('preferred_roles_user_priority_idx').on(table.userId, table.priority)],
);

export type PreferredRole = typeof preferredRoles.$inferSelect;
export type NewPreferredRole = typeof preferredRoles.$inferInsert;

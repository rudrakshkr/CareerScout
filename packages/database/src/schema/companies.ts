import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './users.js';

export const companies = sqliteTable(
  'companies',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    websiteUrl: text('website_url'),
    careersUrl: text('careers_url'),
    atsProvider: text('ats_provider', {
      enum: ['greenhouse', 'lever', 'ashby', 'direct', 'other'],
    })
      .notNull()
      .default('other'),
    atsBoardToken: text('ats_board_token'),
    industry: text('industry'),
    headquarters: text('headquarters'),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex('companies_user_normalized_name_unique').on(table.userId, table.normalizedName),
    index('companies_user_idx').on(table.userId),
  ],
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

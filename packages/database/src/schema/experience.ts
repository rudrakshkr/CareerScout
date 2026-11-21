import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users.js';

export const experienceEntries = sqliteTable(
  'experience_entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyName: text('company_name').notNull(),
    jobTitle: text('job_title').notNull(),
    employmentType: text('employment_type', {
      enum: ['internship', 'full_time', 'part_time', 'contract', 'freelance', 'volunteer', 'apprenticeship', 'other'],
    }),
    location: text('location'),
    workArrangement: text('work_arrangement', { enum: ['onsite', 'hybrid', 'remote'] }),
    startDate: text('start_date'),
    endDate: text('end_date'),
    isCurrent: integer('is_current', { mode: 'boolean' }).notNull().default(false),
    description: text('description'),
    achievements: text('achievements'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [index('experience_entries_user_sort_idx').on(table.userId, table.sortOrder)],
);

export type ExperienceEntry = typeof experienceEntries.$inferSelect;
export type NewExperienceEntry = typeof experienceEntries.$inferInsert;

import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users.js';

export const educationEntries = sqliteTable(
  'education_entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    institution: text('institution').notNull(),
    educationLevel: text('education_level', {
      enum: ['high_school', 'diploma', 'associate', 'bachelor', 'master', 'doctorate', 'bootcamp', 'other'],
    }),
    degree: text('degree'),
    fieldOfStudy: text('field_of_study'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    graduationYear: integer('graduation_year'),
    grade: text('grade'),
    description: text('description'),
    isCurrent: integer('is_current', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [index('education_entries_user_sort_idx').on(table.userId, table.sortOrder)],
);

export type EducationEntry = typeof educationEntries.$inferSelect;
export type NewEducationEntry = typeof educationEntries.$inferInsert;

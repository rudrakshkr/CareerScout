import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users.js';

export const jobPreferences = sqliteTable(
  'job_preferences',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    minimumSalary: integer('minimum_salary'),
    maximumSalary: integer('maximum_salary'),
    salaryCurrency: text('salary_currency'),
    salaryPeriod: text('salary_period', { enum: ['hourly', 'monthly', 'yearly'] }),
    paidPreference: text('paid_preference', { enum: ['paid_only', 'paid_preferred', 'any'] })
      .notNull()
      .default('paid_preferred'),
    workArrangement: text('work_arrangement', {
      enum: ['remote_only', 'remote_preferred', 'hybrid_or_remote', 'any'],
    })
      .notNull()
      .default('any'),
    willingToRelocate: integer('willing_to_relocate', { mode: 'boolean' }).notNull().default(false),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    check(
      'job_preferences_salary_range_check',
      sql`${table.minimumSalary} IS NULL OR ${table.maximumSalary} IS NULL OR ${table.minimumSalary} <= ${table.maximumSalary}`,
    ),
    check(
      'job_preferences_salary_nonnegative_check',
      sql`(${table.minimumSalary} IS NULL OR ${table.minimumSalary} >= 0) AND (${table.maximumSalary} IS NULL OR ${table.maximumSalary} >= 0)`,
    ),
  ],
);

export type JobPreferences = typeof jobPreferences.$inferSelect;
export type NewJobPreferences = typeof jobPreferences.$inferInsert;

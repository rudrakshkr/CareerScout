import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users.js';

export const researchRuns = sqliteTable(
  'research_runs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mode: text('mode', { enum: ['quick', 'overnight'] }).notNull().default('quick'),
    status: text('status', {
      enum: ['queued', 'running', 'paused', 'completed', 'failed', 'cancelled'],
    })
      .notNull()
      .default('queued'),
    configJson: text('config_json').notNull().default('{}'),
    checkpointJson: text('checkpoint_json').notNull().default('{}'),
    jobsScanned: integer('jobs_scanned').notNull().default(0),
    jobsMatched: integer('jobs_matched').notNull().default(0),
    contactsFound: integer('contacts_found').notNull().default(0),
    draftsCreated: integer('drafts_created').notNull().default(0),
    logsJson: text('logs_json').notNull().default('[]'),
    errorMessage: text('error_message'),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [index('research_runs_user_created_idx').on(table.userId, table.createdAt)],
);

export type ResearchRun = typeof researchRuns.$inferSelect;
export type NewResearchRun = typeof researchRuns.$inferInsert;

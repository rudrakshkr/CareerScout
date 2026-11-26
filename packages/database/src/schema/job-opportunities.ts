import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { companies } from './companies.js';
import { users } from './users.js';

export const jobOpportunities = sqliteTable(
  'job_opportunities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: text('company_id').references(() => companies.id, { onDelete: 'set null' }),
    fingerprint: text('fingerprint').notNull(),
    title: text('title').notNull(),
    companyName: text('company_name').notNull(),
    sourceName: text('source_name').notNull(),
    sourceUrl: text('source_url').notNull(),
    applyUrl: text('apply_url'),
    locationText: text('location_text'),
    countryScope: text('country_scope', {
      enum: ['national', 'international', 'remote_global', 'unknown'],
    })
      .notNull()
      .default('unknown'),
    workArrangement: text('work_arrangement', {
      enum: ['remote', 'hybrid', 'onsite', 'unknown'],
    })
      .notNull()
      .default('unknown'),
    employmentType: text('employment_type', {
      enum: ['internship', 'full_time', 'part_time', 'contract', 'unknown'],
    })
      .notNull()
      .default('unknown'),
    compensationStatus: text('compensation_status', {
      enum: ['paid', 'unpaid', 'unspecified'],
    })
      .notNull()
      .default('unspecified'),
    salaryText: text('salary_text'),
    description: text('description'),
    matchedRoleTitle: text('matched_role_title'),
    matchScore: integer('match_score').notNull().default(0),
    matchReasonsJson: text('match_reasons_json').notNull().default('[]'),
    matchedSkillsJson: text('matched_skills_json').notNull().default('[]'),
    missingSkillsJson: text('missing_skills_json').notNull().default('[]'),
    verificationStatus: text('verification_status', {
      enum: ['discovered', 'needs_review', 'verified_active', 'expired', 'rejected'],
    })
      .notNull()
      .default('discovered'),
    applicationStatus: text('application_status', {
      enum: ['none', 'saved', 'preparing', 'applied', 'interviewing', 'offer', 'rejected'],
    })
      .notNull()
      .default('none'),
    postedAt: integer('posted_at', { mode: 'timestamp' }),
    discoveredAt: integer('discovered_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    uniqueIndex('job_opportunities_user_fingerprint_unique').on(table.userId, table.fingerprint),
    index('job_opportunities_user_score_idx').on(table.userId, table.matchScore),
    index('job_opportunities_user_posted_idx').on(table.userId, table.postedAt),
    index('job_opportunities_user_discovered_idx').on(table.userId, table.discoveredAt),
  ],
);

export type JobOpportunity = typeof jobOpportunities.$inferSelect;
export type NewJobOpportunity = typeof jobOpportunities.$inferInsert;

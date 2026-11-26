import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { companies } from './companies.js';
import { jobOpportunities } from './job-opportunities.js';
import { users } from './users.js';

export const companyContacts = sqliteTable(
  'company_contacts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: text('company_id').references(() => companies.id, { onDelete: 'set null' }),
    jobId: text('job_id').references(() => jobOpportunities.id, { onDelete: 'set null' }),
    companyName: text('company_name').notNull(),
    fullName: text('full_name').notNull(),
    roleTitle: text('role_title'),
    contactType: text('contact_type', {
      enum: ['recruiter', 'hiring_manager', 'engineer_referral', 'founder', 'talent_team', 'other'],
    })
      .notNull()
      .default('recruiter'),
    email: text('email'),
    profileUrl: text('profile_url'),
    platform: text('platform', {
      enum: ['email', 'linkedin', 'github', 'x', 'company_site', 'other'],
    })
      .notNull()
      .default('linkedin'),
    sourceUrl: text('source_url').notNull(),
    sourceNote: text('source_note'),
    confidence: text('confidence', {
      enum: ['verified', 'likely', 'search_lead'],
    })
      .notNull()
      .default('search_lead'),
    lastVerifiedAt: integer('last_verified_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index('company_contacts_user_company_idx').on(table.userId, table.companyName),
    index('company_contacts_user_job_idx').on(table.userId, table.jobId),
  ],
);

export type CompanyContact = typeof companyContacts.$inferSelect;
export type NewCompanyContact = typeof companyContacts.$inferInsert;

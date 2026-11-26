import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { companyContacts } from './contacts.js';
import { jobOpportunities } from './job-opportunities.js';
import { users } from './users.js';

export const outreachDrafts = sqliteTable(
  'outreach_drafts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jobId: text('job_id')
      .notNull()
      .references(() => jobOpportunities.id, { onDelete: 'cascade' }),
    contactId: text('contact_id').references(() => companyContacts.id, { onDelete: 'set null' }),
    companyName: text('company_name').notNull(),
    roleTitle: text('role_title').notNull(),
    channel: text('channel', {
      enum: ['email', 'linkedin_dm', 'linkedin_note', 'referral_request', 'cover_letter', 'other'],
    })
      .notNull()
      .default('email'),
    recipientLabel: text('recipient_label').notNull(),
    recipientTarget: text('recipient_target'),
    subject: text('subject'),
    body: text('body').notNull(),
    groundingFactsJson: text('grounding_facts_json').notNull().default('[]'),
    status: text('status', {
      enum: ['pending_review', 'approved', 'rejected', 'sent_externally'],
    })
      .notNull()
      .default('pending_review'),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index('outreach_drafts_user_status_idx').on(table.userId, table.status),
    index('outreach_drafts_user_job_idx').on(table.userId, table.jobId),
  ],
);

export type OutreachDraft = typeof outreachDrafts.$inferSelect;
export type NewOutreachDraft = typeof outreachDrafts.$inferInsert;

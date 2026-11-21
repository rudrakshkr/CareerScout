import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users.js';

export const profiles = sqliteTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  phone: text('phone'),
  locationCity: text('location_city'),
  locationCountry: text('location_country'),
  headline: text('headline'),
  portfolioUrl: text('portfolio_url'),
  linkedinUrl: text('linkedin_url'),
  githubUrl: text('github_url'),
  currentTitle: text('current_title'),
  // Retained for compatibility with the first profile schema. Education entries
  // are now the source of truth for users with multiple qualifications.
  educationLevel: text('education_level'),
  institution: text('institution'),
  graduationYear: integer('graduation_year'),
  onboardingStatus: text('onboarding_status', {
    enum: ['not_started', 'in_progress', 'completed'],
  })
    .notNull()
    .default('not_started'),
  onboardingCurrentStep: text('onboarding_current_step', {
    enum: ['personal', 'education', 'experience', 'projects', 'skills', 'preferences', 'resume'],
  })
    .notNull()
    .default('personal'),
  onboardingCompletedAt: integer('onboarding_completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

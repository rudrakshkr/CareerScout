import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './users.js';

export const userSkills = sqliteTable(
  'user_skills',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: text('category', {
      enum: ['programming_language', 'frontend', 'backend', 'database', 'tool', 'cloud', 'testing', 'soft_skill', 'other'],
    })
      .notNull()
      .default('other'),
    proficiency: text('proficiency', { enum: ['beginner', 'intermediate', 'advanced', 'expert'] }),
    yearsExperience: real('years_experience'),
    isHighlighted: integer('is_highlighted', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index('user_skills_user_sort_idx').on(table.userId, table.sortOrder),
    uniqueIndex('user_skills_user_name_unique').on(table.userId, table.name),
  ],
);

export type UserSkill = typeof userSkills.$inferSelect;
export type NewUserSkill = typeof userSkills.$inferInsert;

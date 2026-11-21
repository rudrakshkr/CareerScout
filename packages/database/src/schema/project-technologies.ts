import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { projects } from './projects.js';

export const projectTechnologies = sqliteTable(
  'project_technologies',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('project_technologies_project_idx').on(table.projectId),
    uniqueIndex('project_technologies_project_name_unique').on(table.projectId, table.name),
  ],
);

export type ProjectTechnology = typeof projectTechnologies.$inferSelect;
export type NewProjectTechnology = typeof projectTechnologies.$inferInsert;

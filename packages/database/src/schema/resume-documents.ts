import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './users.js';

export const resumeDocuments = sqliteTable(
  'resume_documents',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    originalFilename: text('original_filename').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    mimeType: text('mime_type', { enum: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] }).notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    sha256Hash: text('sha256_hash').notNull(),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    processingStatus: text('processing_status', {
      enum: ['uploaded', 'queued', 'processing', 'needs_review', 'verified', 'failed'],
    })
      .notNull()
      .default('uploaded'),
    extractedTextStorageKey: text('extracted_text_storage_key'),
    processingError: text('processing_error'),
    uploadedAt: integer('uploaded_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (table) => [
    index('resume_documents_user_uploaded_idx').on(table.userId, table.uploadedAt),
    uniqueIndex('resume_documents_one_primary_per_user_unique')
      .on(table.userId)
      .where(sql`${table.isPrimary} = 1`),
  ],
);

export type ResumeDocument = typeof resumeDocuments.$inferSelect;
export type NewResumeDocument = typeof resumeDocuments.$inferInsert;

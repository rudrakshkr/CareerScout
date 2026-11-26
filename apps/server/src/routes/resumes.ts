import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { basename, extname, isAbsolute, relative, resolve } from 'node:path';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { and, desc, eq } from 'drizzle-orm';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import type { AppDatabase } from '@career-scout/database';
import { resumeDocuments } from '@career-scout/database';
import { requireAuth } from '../middleware/auth.js';

const require = createRequire(import.meta.url);
const mammoth = require('mammoth') as typeof import('mammoth');

const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 500_000;
const PDF_MIME_TYPE = 'application/pdf' as const;
const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const;
type ResumeMimeType = typeof resumeDocuments.$inferInsert.mimeType;
type ResumeProcessingStatus = typeof resumeDocuments.$inferInsert.processingStatus;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_RESUME_BYTES,
    files: 1,
    fields: 0,
    parts: 1,
    fieldNameSize: 64,
    headerPairs: 100,
  },
});

function sanitizeFilename(input: string): string {
  const normalizedPath = input.replace(/\\/gu, '/');
  const leafName = basename(normalizedPath).normalize('NFKC');
  const safeName = leafName.replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, 180);
  return safeName || 'resume';
}

function identifyFile(file: Express.Multer.File): { extension: 'pdf' | 'docx'; mimeType: ResumeMimeType } | null {
  const extension = extname(sanitizeFilename(file.originalname)).toLowerCase();
  if (extension === '.pdf' && file.buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { extension: 'pdf', mimeType: PDF_MIME_TYPE };
  }
  if (
    extension === '.docx' &&
    file.buffer.length >= 4 &&
    file.buffer[0] === 0x50 && file.buffer[1] === 0x4b &&
    file.buffer[2] === 0x03 && file.buffer[3] === 0x04
  ) {
    return { extension: 'docx', mimeType: DOCX_MIME_TYPE };
  }
  return null;
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&#(\d+);/gu, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([\da-f]+);/giu, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
}

function htmlToTextWithLinks(html: string): string {
  const withInlineLinks = html.replace(
    /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/giu,
    (_match, _quote: string, rawHref: string, rawLabel: string) => {
      const href = decodeHtmlText(rawHref).trim();
      const label = decodeHtmlText(rawLabel.replace(/<[^>]*>/gu, ' ')).replace(/\s+/gu, ' ').trim();
      if (/^mailto:/iu.test(href)) {
        const email = href.replace(/^mailto:/iu, '').trim();
        return label && label.includes('@') ? label : email || label;
      }
      if (/^tel:/iu.test(href)) {
        const phone = href.replace(/^tel:/iu, '').trim();
        return label && /\d{7,}/u.test(label.replace(/\D/gu, '')) ? label : phone || label;
      }
      try {
        const parsed = new URL(href);
        if (!['http:', 'https:'].includes(parsed.protocol)) return label;
        if (!label) return parsed.href;
        if (label.toLowerCase().includes(parsed.hostname.toLowerCase())) return label;
        return `[${label}](${parsed.href})`;
      } catch {
        return label;
      }
    },
  );
  return decodeHtmlText(
    withInlineLinks
      .replace(/<br\s*\/?>/giu, '\n')
      .replace(/<li\b[^>]*>/giu, '\n• ')
      .replace(/<\/(?:td|th)>/giu, ' | ')
      .replace(/<\/(?:p|h[1-6]|li|div|tr|table|ul|ol|section)>/giu, '\n')
      .replace(/<[^>]*>/gu, ' '),
  )
    .replace(/[ \t]+\|\s*\n/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function cleanExtractedText(raw: string): string {
  return raw
    .replace(/\u0000/gu, '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .filter((line) => !/^\s*(?:--\s*\d+\s+of\s+\d+\s*--|page\s+\d+\s+of\s+\d+)\s*$/iu.test(line))
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
    .slice(0, MAX_EXTRACTED_CHARACTERS);
}

async function extractText(buffer: Buffer, extension: 'pdf' | 'docx'): Promise<string> {
  if (extension === 'docx') {
    const result = await mammoth.convertToHtml({ buffer });
    const text = cleanExtractedText(htmlToTextWithLinks(result.value));
    if (text) return text;
    const fallback = await mammoth.extractRawText({ buffer });
    return cleanExtractedText(fallback.value);
  }

  const parser = new PDFParse({ data: buffer });
  try {
    try {
      const result = await parser.getText({ parseHyperlinks: true });
      const cleaned = cleanExtractedText(result.text);
      if (cleaned) return cleaned;
    } catch {
      // Fall back to standard text extraction if hyperlink annotation parsing fails.
    }
    const fallback = await parser.getText();
    return cleanExtractedText(fallback.text);
  } finally {
    await parser.destroy();
  }
}

function storagePath(storageRoot: string, storageKey: string): string {
  const root = resolve(storageRoot);
  const target = resolve(root, storageKey);
  const relativePath = relative(root, target);
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('Invalid resume storage key.');
  }
  return target;
}

async function writePrivateFile(targetPath: string, data: Buffer): Promise<void> {
  const directory = resolve(targetPath, '..');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, data, { flag: 'wx', mode: 0o600 });
    await rename(temporaryPath, targetPath);
    await chmod(targetPath, 0o600);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function removeStoredFile(storageRoot: string, storageKey: string | null): Promise<void> {
  if (!storageKey) return;
  try {
    await unlink(storagePath(storageRoot, storageKey));
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
}

function getOwnedResume(db: AppDatabase, userId: string, resumeId: string) {
  return db.select().from(resumeDocuments)
    .where(and(eq(resumeDocuments.id, resumeId), eq(resumeDocuments.userId, userId)))
    .get();
}

function requireSameOrigin(request: Request, response: Response, next: NextFunction): void {
  const origin = request.get('origin');
  if (!origin) {
    next();
    return;
  }
  try {
    const originUrl = new URL(origin);
    const requestHost = request.get('host');
    if (!requestHost || originUrl.host.toLowerCase() !== requestHost.toLowerCase()) {
      response.status(403).json({ error: 'Cross-origin request rejected.' });
      return;
    }
    next();
  } catch {
    response.status(403).json({ error: 'Invalid request origin.' });
  }
}

export function createResumeRouter(db: AppDatabase, resumeStorageRoot: string): Router {
  const router = Router();
  const storageRoot = resolve(resumeStorageRoot);

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(requireSameOrigin);
  router.use(requireAuth(db));

  router.get('/', (request, response) => {
    const userId = request.auth!.id;
    const resumes = db.select({
      id: resumeDocuments.id,
      originalFilename: resumeDocuments.originalFilename,
      mimeType: resumeDocuments.mimeType,
      fileSizeBytes: resumeDocuments.fileSizeBytes,
      isPrimary: resumeDocuments.isPrimary,
      processingStatus: resumeDocuments.processingStatus,
      processingError: resumeDocuments.processingError,
      extractedTextStorageKey: resumeDocuments.extractedTextStorageKey,
      uploadedAt: resumeDocuments.uploadedAt,
      updatedAt: resumeDocuments.updatedAt,
    }).from(resumeDocuments)
      .where(eq(resumeDocuments.userId, userId))
      .orderBy(desc(resumeDocuments.uploadedAt))
      .all()
      .map(({ extractedTextStorageKey, ...resume }) => ({
        ...resume,
        hasExtractedText: Boolean(extractedTextStorageKey),
      }));
    response.status(200).json({ resumes });
  });

  router.post('/', upload.single('resume'), async (request, response) => {
    const file = request.file;
    if (!file) {
      response.status(400).json({ error: 'Attach one PDF or DOCX file using the "resume" field.' });
      return;
    }
    if (file.size === 0) {
      response.status(400).json({ error: 'The selected file is empty.' });
      return;
    }

    const identified = identifyFile(file);
    if (!identified) {
      response.status(415).json({ error: 'Only valid PDF and DOCX resumes are supported.' });
      return;
    }

    let extractedText: string;
    try {
      extractedText = await extractText(file.buffer, identified.extension);
    } catch {
      response.status(400).json({ error: 'The document could not be read. Check that it is a valid, unencrypted PDF or DOCX file.' });
      return;
    }

    const userId = request.auth!.id;
    const id = randomUUID();
    const storageKey = `${userId}/${id}.${identified.extension}`;
    const extractedTextStorageKey = extractedText.length > 0 ? `${userId}/${id}.txt` : null;
    const originalFilename = sanitizeFilename(file.originalname);
    const sha256Hash = createHash('sha256').update(file.buffer).digest('hex');
    const processingStatus: ResumeProcessingStatus = extractedText.length > 0 ? 'needs_review' : 'failed';
    const processingError = extractedText.length > 0
      ? null
      : 'No selectable text was found. This may be a scanned PDF; the original file is still available.';

    const originalPath = storagePath(storageRoot, storageKey);
    const textPath = extractedTextStorageKey ? storagePath(storageRoot, extractedTextStorageKey) : null;
    try {
      await writePrivateFile(originalPath, file.buffer);
      if (textPath) await writePrivateFile(textPath, Buffer.from(extractedText, 'utf8'));

      const resume = db.transaction((transaction) => {
        const hasPrimary = transaction.select({ id: resumeDocuments.id })
          .from(resumeDocuments)
          .where(and(eq(resumeDocuments.userId, userId), eq(resumeDocuments.isPrimary, true)))
          .limit(1)
          .get() !== undefined;
        transaction.insert(resumeDocuments).values({
          id,
          userId,
          originalFilename,
          storageKey,
          mimeType: identified.mimeType,
          fileSizeBytes: file.size,
          sha256Hash,
          isPrimary: !hasPrimary,
          processingStatus,
          extractedTextStorageKey,
          processingError,
          updatedAt: new Date(),
        }).run();
        return transaction.select().from(resumeDocuments)
          .where(eq(resumeDocuments.id, id))
          .get();
      });

      response.status(201).json({ resume: {
        id: resume!.id,
        originalFilename: resume!.originalFilename,
        mimeType: resume!.mimeType,
        fileSizeBytes: resume!.fileSizeBytes,
        isPrimary: resume!.isPrimary,
        processingStatus: resume!.processingStatus,
        processingError: resume!.processingError,
        hasExtractedText: Boolean(resume!.extractedTextStorageKey),
        uploadedAt: resume!.uploadedAt,
      } });
    } catch (error) {
      await removeStoredFile(storageRoot, storageKey).catch(() => undefined);
      await removeStoredFile(storageRoot, extractedTextStorageKey).catch(() => undefined);
      throw error;
    }
  });

  router.patch('/:id/primary', (request, response) => {
    const userId = request.auth!.id;
    const resumeId = request.params.id;
    const updated = db.transaction((transaction) => {
      const target = transaction.select({ id: resumeDocuments.id })
        .from(resumeDocuments)
        .where(and(eq(resumeDocuments.id, resumeId), eq(resumeDocuments.userId, userId)))
        .get();
      if (!target) return false;
      transaction.update(resumeDocuments)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(eq(resumeDocuments.userId, userId))
        .run();
      transaction.update(resumeDocuments)
        .set({ isPrimary: true, updatedAt: new Date() })
        .where(and(eq(resumeDocuments.id, resumeId), eq(resumeDocuments.userId, userId)))
        .run();
      return true;
    });
    if (!updated) {
      response.status(404).json({ error: 'Resume not found.' });
      return;
    }
    response.status(200).json({ saved: true });
  });

  router.get('/:id/text', async (request, response) => {
    const resume = getOwnedResume(db, request.auth!.id, request.params.id);
    if (!resume) {
      response.status(404).json({ error: 'Resume not found.' });
      return;
    }
    if (!resume.extractedTextStorageKey) {
      response.status(409).json({ error: resume.processingError ?? 'No extracted text is available for this resume.' });
      return;
    }

    const shouldRefresh = request.query.refresh === '1' || request.query.refresh === 'true';
    if (shouldRefresh) {
      try {
        const originalBuffer = await readFile(storagePath(storageRoot, resume.storageKey));
        const extension: 'pdf' | 'docx' = resume.mimeType === PDF_MIME_TYPE ? 'pdf' : 'docx';
        const refreshed = await extractText(originalBuffer, extension);
        if (refreshed.length > 0) {
          await writePrivateFile(storagePath(storageRoot, resume.extractedTextStorageKey), Buffer.from(refreshed, 'utf8'));
          response.status(200).type('text/plain').send(refreshed);
          return;
        }
      } catch {
        // Fall back to the previously stored extracted text if refresh fails.
      }
    }

    try {
      const content = await readFile(storagePath(storageRoot, resume.extractedTextStorageKey), 'utf8');
      response.status(200).type('text/plain').send(content);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        response.status(404).json({ error: 'Extracted resume text is no longer available.' });
        return;
      }
      throw error;
    }
  });

  router.get('/:id/download', async (request, response) => {
    const resume = getOwnedResume(db, request.auth!.id, request.params.id);
    if (!resume) {
      response.status(404).json({ error: 'Resume not found.' });
      return;
    }
    try {
      const content = await readFile(storagePath(storageRoot, resume.storageKey));
      response.setHeader('Content-Type', resume.mimeType);
      response.setHeader('Content-Length', content.length);
      response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(resume.originalFilename)}`);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.status(200).send(content);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
        response.status(404).json({ error: 'Resume file is no longer available.' });
        return;
      }
      throw error;
    }
  });

  router.delete('/:id', async (request, response) => {
    const userId = request.auth!.id;
    const resume = getOwnedResume(db, userId, request.params.id);
    if (!resume) {
      response.status(404).json({ error: 'Resume not found.' });
      return;
    }

    db.transaction((transaction) => {
      transaction.delete(resumeDocuments)
        .where(and(eq(resumeDocuments.id, resume.id), eq(resumeDocuments.userId, userId)))
        .run();
      if (resume.isPrimary) {
        const replacement = transaction.select({ id: resumeDocuments.id })
          .from(resumeDocuments)
          .where(eq(resumeDocuments.userId, userId))
          .orderBy(desc(resumeDocuments.uploadedAt))
          .limit(1)
          .get();
        if (replacement) {
          transaction.update(resumeDocuments)
            .set({ isPrimary: true, updatedAt: new Date() })
            .where(eq(resumeDocuments.id, replacement.id))
            .run();
        }
      }
    });

    await Promise.all([
      removeStoredFile(storageRoot, resume.storageKey),
      removeStoredFile(storageRoot, resume.extractedTextStorageKey),
    ]);
    response.status(204).end();
  });

  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      response.status(tooLarge ? 413 : 400).json({
        error: tooLarge
          ? `Resume exceeds the ${MAX_RESUME_BYTES / (1024 * 1024)} MB upload limit.`
          : 'Upload one file only, using the "resume" field.',
      });
      return;
    }
    console.error('[career-scout-api] Resume request failed:', error);
    response.status(500).json({ error: 'Resume operation failed.' });
  });

  return router;
}

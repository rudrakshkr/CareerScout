import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppDatabase } from '@career-scout/database';
import {
  companies,
  companyContacts,
  jobOpportunities,
  outreachDrafts,
  resumeDocuments,
} from '@career-scout/database';
import { inspectOllama } from '../ai/ollama.js';
import {
  getUserRuntimeConfig,
  saveUserRuntimeConfig,
  toPublicRuntimeConfig,
} from '../config/user-runtime-config.js';
import { isValidEmailAddress, sendApprovedEmail, verifySmtpConnection } from '../mail/mailer.js';
import { requireAuth } from '../middleware/auth.js';
import { firecrawlWebSearch } from '../discovery/connectors.js';
import { buildMasterCoverLetterPack } from '../discovery/cover-letter.js';
import {
  discoverCompanyContacts,
  generateGroundedDraftProposals,
} from '../discovery/people-and-drafts.js';
import {
  getActiveRunForUser,
  isRunActive,
  listRecentRuns,
  loadUserProfileContext,
  persistJobWithContactsAndDrafts,
  requestStopRun,
  startDiscoveryRun,
} from '../discovery/runner.js';
import type { DiscoveryRunConfig, RawDiscoveredJob } from '../discovery/types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeParseArray(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function safeParseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function classifyDraftTarget(
  recipientTarget: string | null,
  channel: string,
): 'email' | 'person_profile' | 'job_posting' | 'none' {
  const target = (recipientTarget ?? '').trim();
  if (!target) return 'none';
  if (isValidEmailAddress(target)) return 'email';
  if (/linkedin\.com\/in\/|github\.com\/[^/?#]+\/?$|x\.com\/[^/?#]+\/?$/iu.test(target)) {
    return 'person_profile';
  }
  if (channel === 'cover_letter') return 'job_posting';
  return 'job_posting';
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

const VALID_APP_STATUSES = new Set(['none', 'saved', 'preparing', 'applied', 'interviewing', 'offer', 'rejected']);
const VALID_VERIFICATION_STATUSES = new Set(['discovered', 'needs_review', 'verified_active', 'expired', 'rejected']);
const VALID_DRAFT_STATUSES = new Set(['pending_review', 'approved', 'rejected', 'sent_externally']);
const VALID_CONTACT_TYPES = new Set(['recruiter', 'hiring_manager', 'engineer_referral', 'founder', 'talent_team', 'other']);
const VALID_PLATFORMS = new Set(['email', 'linkedin', 'github', 'x', 'company_site', 'other']);

export function createDiscoveryRouter(
  db: AppDatabase,
  resumeStorageRoot = '.local-job-agent/resumes',
): Router {
  const router = Router();

  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(requireSameOrigin);
  router.use(requireAuth(db));

  // --- Per-User Integrations (Firecrawl, GitHub, Ollama, SMTP) ---

  router.get('/integrations', async (request, response) => {
    const userId = request.auth!.id;
    const config = getUserRuntimeConfig(userId);
    const ollamaStatus = await inspectOllama(config.ollamaBaseUrl);
    response.status(200).json({
      config: toPublicRuntimeConfig(config),
      ollama: ollamaStatus,
    });
  });

  router.put('/integrations', async (request, response) => {
    const userId = request.auth!.id;
    const body = request.body;
    if (!isRecord(body)) {
      response.status(400).json({ error: 'A JSON object is required.' });
      return;
    }

    const patch: Parameters<typeof saveUserRuntimeConfig>[1] = {};
    if (typeof body.firecrawlApiKey === 'string') patch.firecrawlApiKey = body.firecrawlApiKey.trim() || null;
    if (body.clearFirecrawlApiKey === true) patch.firecrawlApiKey = null;
    if (typeof body.githubToken === 'string') patch.githubToken = body.githubToken.trim() || null;
    if (body.clearGithubToken === true) patch.githubToken = null;
    if (typeof body.ollamaBaseUrl === 'string' && body.ollamaBaseUrl.trim()) {
      try {
        const parsed = new URL(body.ollamaBaseUrl.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
        patch.ollamaBaseUrl = parsed.origin;
      } catch {
        response.status(400).json({ error: 'Ollama Base URL must be a valid HTTP or HTTPS URL.' });
        return;
      }
    }
    if (typeof body.ollamaModel === 'string') patch.ollamaModel = body.ollamaModel.trim() || null;
    if (body.ollamaModel === null) patch.ollamaModel = null;
    if (typeof body.smtpHost === 'string') patch.smtpHost = body.smtpHost.trim() || null;
    if (typeof body.smtpPort === 'number' && Number.isInteger(body.smtpPort) && body.smtpPort >= 1 && body.smtpPort <= 65535) {
      patch.smtpPort = body.smtpPort;
    }
    if (typeof body.smtpSecure === 'boolean') patch.smtpSecure = body.smtpSecure;
    if (typeof body.smtpUser === 'string') patch.smtpUser = body.smtpUser.trim() || null;
    if (typeof body.smtpPass === 'string' && body.smtpPass.trim()) patch.smtpPass = body.smtpPass.trim();
    if (body.clearSmtpPass === true) patch.smtpPass = null;
    if (typeof body.smtpFromName === 'string') patch.smtpFromName = body.smtpFromName.trim() || null;

    const updated = await saveUserRuntimeConfig(userId, patch);
    const ollamaStatus = await inspectOllama(updated.ollamaBaseUrl);
    response.status(200).json({
      saved: true,
      config: toPublicRuntimeConfig(updated),
      ollama: ollamaStatus,
    });
  });

  router.post('/integrations/test-firecrawl', async (request, response) => {
    const config = getUserRuntimeConfig(request.auth!.id);
    if (!config.firecrawlApiKey) {
      response.status(400).json({ error: 'Save your Firecrawl API key first.' });
      return;
    }
    const res = await firecrawlWebSearch({
      apiKey: config.firecrawlApiKey,
      query: 'site:boards.greenhouse.io software engineer intern',
      limit: 2,
    });
    if (!res.ok) {
      response.status(400).json({ error: res.error || 'Firecrawl test query failed.' });
      return;
    }
    response.status(200).json({ ok: true, sampleHits: res.hits.length });
  });

  router.post('/integrations/test-smtp', async (request, response) => {
    const config = getUserRuntimeConfig(request.auth!.id);
    const result = await verifySmtpConnection(config);
    if (!result.ok) {
      response.status(400).json({ error: result.error || 'SMTP verification failed.' });
      return;
    }
    response.status(200).json({ ok: true });
  });

  // --- Summary ---

  router.get('/summary', (request, response) => {
    const userId = request.auth!.id;
    const jobs = db.select({
      id: jobOpportunities.id,
      applicationStatus: jobOpportunities.applicationStatus,
      verificationStatus: jobOpportunities.verificationStatus,
      matchScore: jobOpportunities.matchScore,
    }).from(jobOpportunities).where(eq(jobOpportunities.userId, userId)).all();

    const companyList = db.select({ id: companies.id }).from(companies).where(eq(companies.userId, userId)).all();
    const contactList = db.select({ id: companyContacts.id }).from(companyContacts).where(eq(companyContacts.userId, userId)).all();
    const draftList = db.select({ id: outreachDrafts.id, status: outreachDrafts.status }).from(outreachDrafts).where(eq(outreachDrafts.userId, userId)).all();
    const runs = listRecentRuns(db, userId);

    const activeRunId = getActiveRunForUser(userId);
    const latestRun = runs[0] ?? null;
    const runtime = getUserRuntimeConfig(userId);

    response.status(200).json({
      counts: {
        totalJobs: jobs.length,
        strongMatches: jobs.filter((j) => j.matchScore >= 65).length,
        applicationsActive: jobs.filter((j) => j.applicationStatus !== 'none').length,
        companies: companyList.length,
        contacts: contactList.length,
        pendingDrafts: draftList.filter((d) => d.status === 'pending_review').length,
        approvedDrafts: draftList.filter((d) => d.status === 'approved' || d.status === 'sent_externally').length,
      },
      activeRunId,
      latestRun: latestRun
        ? {
            id: latestRun.id,
            mode: latestRun.mode,
            status: latestRun.status,
            jobsScanned: latestRun.jobsScanned,
            jobsMatched: latestRun.jobsMatched,
            contactsFound: latestRun.contactsFound,
            draftsCreated: latestRun.draftsCreated,
            startedAt: latestRun.startedAt?.toISOString() ?? null,
            finishedAt: latestRun.finishedAt?.toISOString() ?? null,
          }
        : null,
      providers: {
        firecrawlConfigured: Boolean(runtime.firecrawlApiKey),
        githubTokenConfigured: Boolean(runtime.githubToken),
        ollamaConfigured: Boolean(runtime.ollamaModel),
        smtpConfigured: Boolean(runtime.smtpHost && runtime.smtpUser && runtime.smtpPass),
      },
    });
  });

  // --- Jobs ---

  router.get('/jobs', (request, response) => {
    const userId = request.auth!.id;
    const rows = db.select().from(jobOpportunities).where(eq(jobOpportunities.userId, userId)).all();
    const contacts = db.select({ jobId: companyContacts.jobId }).from(companyContacts).where(eq(companyContacts.userId, userId)).all();
    const drafts = db.select({ jobId: outreachDrafts.jobId }).from(outreachDrafts).where(eq(outreachDrafts.userId, userId)).all();

    const contactCountByJob = new Map<string, number>();
    for (const c of contacts) if (c.jobId) contactCountByJob.set(c.jobId, (contactCountByJob.get(c.jobId) ?? 0) + 1);
    const draftCountByJob = new Map<string, number>();
    for (const d of drafts) draftCountByJob.set(d.jobId, (draftCountByJob.get(d.jobId) ?? 0) + 1);

    const search = typeof request.query.search === 'string' ? request.query.search.trim().toLowerCase() : '';
    const workArrangement = typeof request.query.workArrangement === 'string' ? request.query.workArrangement : 'all';
    const compensation = typeof request.query.compensation === 'string' ? request.query.compensation : 'all';
    const scope = typeof request.query.scope === 'string' ? request.query.scope : 'all';
    const employmentType = typeof request.query.employmentType === 'string' ? request.query.employmentType : 'all';
    const recency = typeof request.query.recency === 'string' ? request.query.recency : 'all';
    const applicationStatus = typeof request.query.applicationStatus === 'string' ? request.query.applicationStatus : 'all';
    const minScore = typeof request.query.minScore === 'string' ? Number(request.query.minScore) : 0;
    const sort = typeof request.query.sort === 'string' ? request.query.sort : 'recent';

    const nowMs = Date.now();
    const recencyMaxAgeMs =
      recency === '24h' ? 24 * 3600_000 :
      recency === '7d' ? 7 * 24 * 3600_000 :
      recency === '30d' ? 30 * 24 * 3600_000 :
      null;

    const filtered = rows
      .filter((job) => {
        if (workArrangement !== 'all' && job.workArrangement !== workArrangement) return false;
        if (compensation !== 'all' && job.compensationStatus !== compensation) return false;
        if (scope !== 'all' && job.countryScope !== scope) return false;
        if (employmentType !== 'all' && job.employmentType !== employmentType) return false;
        if (applicationStatus === 'active') {
          if (job.applicationStatus === 'none') return false;
        } else if (applicationStatus !== 'all' && job.applicationStatus !== applicationStatus) {
          return false;
        }
        if (Number.isFinite(minScore) && minScore > 0 && job.matchScore < minScore) return false;
        if (recencyMaxAgeMs !== null) {
          const refTime = (job.postedAt ?? job.discoveredAt).getTime();
          if (nowMs - refTime > recencyMaxAgeMs) return false;
        }
        if (search) {
          const hay = `${job.title} ${job.companyName} ${job.locationText ?? ''} ${job.matchedRoleTitle ?? ''} ${job.matchedSkillsJson}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sort === 'score' && b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        const aTime = (a.postedAt ?? a.discoveredAt).getTime();
        const bTime = (b.postedAt ?? b.discoveredAt).getTime();
        if (bTime !== aTime) return bTime - aTime;
        return b.matchScore - a.matchScore;
      })
      .map((job) => ({
        id: job.id,
        companyId: job.companyId,
        title: job.title,
        companyName: job.companyName,
        sourceName: job.sourceName,
        sourceUrl: job.sourceUrl,
        applyUrl: job.applyUrl,
        locationText: job.locationText,
        countryScope: job.countryScope,
        workArrangement: job.workArrangement,
        employmentType: job.employmentType,
        compensationStatus: job.compensationStatus,
        salaryText: job.salaryText,
        description: job.description,
        matchedRoleTitle: job.matchedRoleTitle,
        matchScore: job.matchScore,
        matchReasons: safeParseArray(job.matchReasonsJson),
        matchedSkills: safeParseArray(job.matchedSkillsJson),
        verificationStatus: job.verificationStatus,
        applicationStatus: job.applicationStatus,
        contactCount: contactCountByJob.get(job.id) ?? 0,
        draftCount: draftCountByJob.get(job.id) ?? 0,
        postedAt: job.postedAt?.toISOString() ?? null,
        discoveredAt: job.discoveredAt.toISOString(),
      }));

    response.status(200).json({ jobs: filtered });
  });

  router.post('/jobs/import', async (request, response) => {
    const body = request.body;
    if (!isRecord(body)) {
      response.status(400).json({ error: 'A JSON request body is required.' });
      return;
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
    const locationText = typeof body.locationText === 'string' ? body.locationText.trim() : '';
    const salaryText = typeof body.salaryText === 'string' ? body.salaryText.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const generateDrafts = body.generateDrafts !== false;

    if (!title || !companyName || !sourceUrl) {
      response.status(400).json({ error: 'Job title, company name, and source URL are required.' });
      return;
    }
    try {
      const parsed = new URL(sourceUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    } catch {
      response.status(400).json({ error: 'Source URL must be a valid http or https link.' });
      return;
    }

    const userId = request.auth!.id;
    const profile = loadUserProfileContext(db, userId);
    if (!profile) {
      response.status(404).json({ error: 'User profile not found.' });
      return;
    }
    const runtime = getUserRuntimeConfig(userId);

    const rawJob: RawDiscoveredJob = {
      sourceName: 'manual_import',
      sourceUrl,
      applyUrl: sourceUrl,
      title,
      companyName,
      locationText: locationText || null,
      salaryText: salaryText || null,
      description: description || null,
      postedAt: new Date(),
    };

    const result = await persistJobWithContactsAndDrafts(db, profile, rawJob, {
      forceAccept: true,
      generateDrafts,
      allowExternalContactLookup: Boolean(runtime.firecrawlApiKey || runtime.githubToken),
      firecrawlApiKey: runtime.firecrawlApiKey,
      githubToken: runtime.githubToken,
      useLocalOllama: false,
      ollamaBaseUrl: runtime.ollamaBaseUrl,
      ollamaModel: runtime.ollamaModel,
    });

    response.status(201).json({
      imported: true,
      isNew: result.isNew,
      jobId: result.jobId,
      contactsAdded: result.contactsAdded,
      draftsAdded: result.draftsAdded,
    });
  });

  router.patch('/jobs/:id', (request, response) => {
    const userId = request.auth!.id;
    const jobId = request.params.id;
    const body = request.body;
    if (!isRecord(body)) {
      response.status(400).json({ error: 'A JSON object is required.' });
      return;
    }

    const existing = db
      .select({ id: jobOpportunities.id })
      .from(jobOpportunities)
      .where(and(eq(jobOpportunities.id, jobId), eq(jobOpportunities.userId, userId)))
      .get();
    if (!existing) {
      response.status(404).json({ error: 'Job opportunity not found.' });
      return;
    }

    const update: Partial<typeof jobOpportunities.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.applicationStatus === 'string') {
      if (!VALID_APP_STATUSES.has(body.applicationStatus)) {
        response.status(400).json({ error: 'Invalid application status.' });
        return;
      }
      update.applicationStatus = body.applicationStatus as typeof jobOpportunities.$inferInsert.applicationStatus;
    }
    if (typeof body.verificationStatus === 'string') {
      if (!VALID_VERIFICATION_STATUSES.has(body.verificationStatus)) {
        response.status(400).json({ error: 'Invalid verification status.' });
        return;
      }
      update.verificationStatus = body.verificationStatus as typeof jobOpportunities.$inferInsert.verificationStatus;
    }

    db.update(jobOpportunities)
      .set(update)
      .where(and(eq(jobOpportunities.id, jobId), eq(jobOpportunities.userId, userId)))
      .run();

    response.status(200).json({ saved: true });
  });

  router.delete('/jobs/:id', (request, response) => {
    const result = db
      .delete(jobOpportunities)
      .where(and(eq(jobOpportunities.id, request.params.id), eq(jobOpportunities.userId, request.auth!.id)))
      .run();
    if (result.changes === 0) {
      response.status(404).json({ error: 'Job opportunity not found.' });
      return;
    }
    response.status(204).end();
  });

  router.post('/jobs/:id/tailor', async (request, response) => {
    const userId = request.auth!.id;
    const job = db
      .select()
      .from(jobOpportunities)
      .where(and(eq(jobOpportunities.id, request.params.id), eq(jobOpportunities.userId, userId)))
      .get();
    if (!job) {
      response.status(404).json({ error: 'Job opportunity not found.' });
      return;
    }
    const profile = loadUserProfileContext(db, userId);
    if (!profile) {
      response.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const company = job.companyId
      ? db.select({ websiteUrl: companies.websiteUrl }).from(companies).where(eq(companies.id, job.companyId)).get()
      : null;

    const runtime = getUserRuntimeConfig(userId);
    const body = isRecord(request.body) ? request.body : {};
    const useAi = body.useLocalOllama === false ? false : Boolean(runtime.ollamaModel);

    const pack = await buildMasterCoverLetterPack({
      job: {
        title: job.title,
        companyName: job.companyName,
        description: job.description,
        sourceUrl: job.sourceUrl,
      },
      companyWebsite: company?.websiteUrl ?? null,
      matchedSkills: safeParseArray(job.matchedSkillsJson),
      profile,
      firecrawlApiKey: body.researchCompany === false ? null : runtime.firecrawlApiKey,
      ollama: {
        enabled: useAi,
        baseUrl: runtime.ollamaBaseUrl,
        model: runtime.ollamaModel,
      },
    });
    response.status(200).json({ pack });
  });

  router.post('/jobs/:id/save-cover-letter', (request, response) => {
    const userId = request.auth!.id;
    const job = db
      .select()
      .from(jobOpportunities)
      .where(and(eq(jobOpportunities.id, request.params.id), eq(jobOpportunities.userId, userId)))
      .get();
    if (!job) {
      response.status(404).json({ error: 'Job opportunity not found.' });
      return;
    }
    const body = request.body;
    if (!isRecord(body) || typeof body.coverLetter !== 'string' || !body.coverLetter.trim()) {
      response.status(400).json({ error: 'Cover letter text is required.' });
      return;
    }
    const groundingFacts = Array.isArray(body.groundingFacts)
      ? body.groundingFacts.filter((x): x is string => typeof x === 'string').slice(0, 10)
      : [];

    const draftId = randomUUID();
    db.insert(outreachDrafts)
      .values({
        id: draftId,
        userId,
        jobId: job.id,
        contactId: null,
        companyName: job.companyName,
        roleTitle: job.title,
        channel: 'cover_letter',
        recipientLabel: `${job.companyName} Hiring Team (Tailored Cover Letter)`,
        recipientTarget: job.applyUrl ?? job.sourceUrl,
        subject: `Application: ${job.title} - ${request.auth!.displayName}`,
        body: body.coverLetter.trim().slice(0, 4000),
        groundingFactsJson: JSON.stringify(groundingFacts),
        status: 'pending_review',
      })
      .run();

    response.status(201).json({ draftId });
  });

  router.post('/jobs/:id/generate-drafts', async (request, response) => {
    const userId = request.auth!.id;
    const job = db
      .select()
      .from(jobOpportunities)
      .where(and(eq(jobOpportunities.id, request.params.id), eq(jobOpportunities.userId, userId)))
      .get();
    if (!job) {
      response.status(404).json({ error: 'Job opportunity not found.' });
      return;
    }
    const profile = loadUserProfileContext(db, userId);
    if (!profile) {
      response.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const runtime = getUserRuntimeConfig(userId);

    const rawJob: RawDiscoveredJob = {
      sourceName: job.sourceName,
      sourceUrl: job.sourceUrl,
      applyUrl: job.applyUrl,
      title: job.title,
      companyName: job.companyName,
      locationText: job.locationText,
      salaryText: job.salaryText,
      description: job.description,
      postedAt: job.postedAt,
    };

    const existingContacts = db
      .select()
      .from(companyContacts)
      .where(and(eq(companyContacts.userId, userId), eq(companyContacts.jobId, job.id)))
      .all();

    const discovery = await discoverCompanyContacts(rawJob, {
      deepLookup: true,
      firecrawlApiKey: runtime.firecrawlApiKey,
      githubToken: runtime.githubToken,
    });

    const mergedContacts = [...existingContacts.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      roleTitle: c.roleTitle,
      contactType: c.contactType,
      email: c.email,
      profileUrl: c.profileUrl,
      platform: c.platform,
      sourceUrl: c.sourceUrl,
      sourceNote: c.sourceNote ?? '',
      confidence: c.confidence,
    }))];

    let newContactsAdded = 0;
    for (const contact of discovery.contacts) {
      const dup = mergedContacts.some(
        (c) =>
          (contact.email && c.email?.toLowerCase() === contact.email.toLowerCase())
          || (contact.profileUrl && c.profileUrl === contact.profileUrl),
      );
      if (dup) continue;
      const contactId = randomUUID();
      db.insert(companyContacts)
        .values({
          id: contactId,
          userId,
          companyId: job.companyId,
          jobId: job.id,
          companyName: job.companyName,
          fullName: contact.fullName,
          roleTitle: contact.roleTitle,
          contactType: contact.contactType,
          email: contact.email,
          profileUrl: contact.profileUrl,
          platform: contact.platform,
          sourceUrl: contact.sourceUrl,
          sourceNote: contact.sourceNote,
          confidence: contact.confidence,
        })
        .run();
      mergedContacts.push({ id: contactId, ...contact });
      newContactsAdded += 1;
    }

    const proposals = await generateGroundedDraftProposals(
      rawJob,
      safeParseArray(job.matchedSkillsJson),
      mergedContacts,
      profile,
      {
        enabled: Boolean(runtime.ollamaModel),
        baseUrl: runtime.ollamaBaseUrl,
        model: runtime.ollamaModel,
      },
      job.matchScore,
    );

    let created = 0;
    for (const proposal of proposals) {
      const linkedContactId =
        proposal.contactIndex !== null && mergedContacts[proposal.contactIndex]
          ? mergedContacts[proposal.contactIndex].id
          : null;
      db.insert(outreachDrafts)
        .values({
          id: randomUUID(),
          userId,
          jobId: job.id,
          contactId: linkedContactId,
          companyName: job.companyName,
          roleTitle: job.title,
          channel: proposal.channel,
          recipientLabel: proposal.recipientLabel,
          recipientTarget: proposal.recipientTarget,
          subject: proposal.subject,
          body: proposal.body,
          groundingFactsJson: JSON.stringify(proposal.groundingFacts),
          status: 'pending_review',
        })
        .run();
      created += 1;
    }

    response.status(201).json({
      created,
      contactsCount: mergedContacts.length,
      newContactsAdded,
      firecrawlUsed: discovery.firecrawlCreditsUsed > 0,
    });
  });

  // --- Companies & Contacts ---

  router.get('/companies', (request, response) => {
    const userId = request.auth!.id;
    const companyRows = db.select().from(companies).where(eq(companies.userId, userId)).orderBy(desc(companies.updatedAt)).all();
    const jobRows = db.select({ companyId: jobOpportunities.companyId }).from(jobOpportunities).where(eq(jobOpportunities.userId, userId)).all();
    const contactRows = db.select({ companyId: companyContacts.companyId }).from(companyContacts).where(eq(companyContacts.userId, userId)).all();

    const jobsByComp = new Map<string, number>();
    for (const j of jobRows) if (j.companyId) jobsByComp.set(j.companyId, (jobsByComp.get(j.companyId) ?? 0) + 1);
    const contactsByComp = new Map<string, number>();
    for (const c of contactRows) if (c.companyId) contactsByComp.set(c.companyId, (contactsByComp.get(c.companyId) ?? 0) + 1);

    response.status(200).json({
      companies: companyRows.map((c) => ({
        id: c.id,
        name: c.name,
        websiteUrl: c.websiteUrl,
        careersUrl: c.careersUrl,
        atsProvider: c.atsProvider,
        headquarters: c.headquarters,
        jobCount: jobsByComp.get(c.id) ?? 0,
        contactCount: contactsByComp.get(c.id) ?? 0,
        updatedAt: c.updatedAt.toISOString(),
      })),
    });
  });

  router.get('/contacts', (request, response) => {
    const userId = request.auth!.id;
    const rows = db.select().from(companyContacts).where(eq(companyContacts.userId, userId)).orderBy(desc(companyContacts.createdAt)).all();
    const search = typeof request.query.search === 'string' ? request.query.search.trim().toLowerCase() : '';
    const confidence = typeof request.query.confidence === 'string' ? request.query.confidence : 'all';

    const filtered = rows
      .filter((c) => {
        if (confidence !== 'all' && c.confidence !== confidence) return false;
        if (search) {
          const hay = `${c.fullName} ${c.companyName} ${c.roleTitle ?? ''} ${c.email ?? ''}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .map((c) => ({
        id: c.id,
        companyId: c.companyId,
        jobId: c.jobId,
        companyName: c.companyName,
        fullName: c.fullName,
        roleTitle: c.roleTitle,
        contactType: c.contactType,
        email: c.email,
        profileUrl: c.profileUrl,
        platform: c.platform,
        sourceUrl: c.sourceUrl,
        sourceNote: c.sourceNote,
        confidence: c.confidence,
        lastVerifiedAt: c.lastVerifiedAt.toISOString(),
      }));

    response.status(200).json({ contacts: filtered });
  });

  router.post('/contacts', (request, response) => {
    const userId = request.auth!.id;
    const body = request.body;
    if (!isRecord(body)) {
      response.status(400).json({ error: 'A JSON object is required.' });
      return;
    }

    const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const roleTitle = typeof body.roleTitle === 'string' ? body.roleTitle.trim() : null;
    const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null;
    const profileUrl = typeof body.profileUrl === 'string' && body.profileUrl.trim() ? body.profileUrl.trim() : null;
    const sourceUrl = typeof body.sourceUrl === 'string' && body.sourceUrl.trim() ? body.sourceUrl.trim() : (profileUrl ?? (email ? `mailto:${email}` : ''));
    const sourceNote = typeof body.sourceNote === 'string' ? body.sourceNote.trim() : 'Added manually by user.';
    const contactType = typeof body.contactType === 'string' && VALID_CONTACT_TYPES.has(body.contactType) ? body.contactType : 'recruiter';
    const platform = typeof body.platform === 'string' && VALID_PLATFORMS.has(body.platform) ? body.platform : (email ? 'email' : 'linkedin');

    if (!companyName || !fullName || !sourceUrl) {
      response.status(400).json({ error: 'Company name, person name, and an email or profile URL are required.' });
      return;
    }

    const id = randomUUID();
    db.insert(companyContacts)
      .values({
        id,
        userId,
        companyName: companyName.slice(0, 140),
        fullName: fullName.slice(0, 120),
        roleTitle: roleTitle?.slice(0, 140) ?? null,
        contactType: contactType as typeof companyContacts.$inferInsert.contactType,
        email,
        profileUrl,
        platform: platform as typeof companyContacts.$inferInsert.platform,
        sourceUrl,
        sourceNote: sourceNote.slice(0, 500),
        confidence: 'verified',
      })
      .run();

    response.status(201).json({ id });
  });

  // --- Outreach Drafts + Human-Approved Email Sending ---

  router.get('/drafts', (request, response) => {
    const userId = request.auth!.id;
    const rows = db.select().from(outreachDrafts).where(eq(outreachDrafts.userId, userId)).orderBy(desc(outreachDrafts.createdAt)).all();
    const jobs = db.select({ id: jobOpportunities.id, sourceUrl: jobOpportunities.sourceUrl, applyUrl: jobOpportunities.applyUrl }).from(jobOpportunities).where(eq(jobOpportunities.userId, userId)).all();
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const status = typeof request.query.status === 'string' ? request.query.status : 'all';
    const channel = typeof request.query.channel === 'string' ? request.query.channel : 'all';
    const jobId = typeof request.query.jobId === 'string' ? request.query.jobId : '';

    const filtered = rows
      .filter((d) => {
        if (status !== 'all' && d.status !== status) return false;
        if (channel !== 'all' && d.channel !== channel) return false;
        if (jobId && d.jobId !== jobId) return false;
        return true;
      })
      .map((d) => {
        const linkedJob = jobMap.get(d.jobId);
        return {
          id: d.id,
          jobId: d.jobId,
          contactId: d.contactId,
          companyName: d.companyName,
          roleTitle: d.roleTitle,
          channel: d.channel,
          recipientLabel: d.recipientLabel,
          recipientTarget: d.recipientTarget,
          targetKind: classifyDraftTarget(d.recipientTarget, d.channel),
          jobSourceUrl: linkedJob?.sourceUrl ?? null,
          jobApplyUrl: linkedJob?.applyUrl ?? null,
          subject: d.subject,
          body: d.body,
          groundingFacts: safeParseArray(d.groundingFactsJson),
          status: d.status,
          reviewedAt: d.reviewedAt?.toISOString() ?? null,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        };
      });

    response.status(200).json({ drafts: filtered });
  });

  router.patch('/drafts/:id', (request, response) => {
    const userId = request.auth!.id;
    const draftId = request.params.id;
    const body = request.body;
    if (!isRecord(body)) {
      response.status(400).json({ error: 'A JSON object is required.' });
      return;
    }

    const existing = db
      .select({ id: outreachDrafts.id })
      .from(outreachDrafts)
      .where(and(eq(outreachDrafts.id, draftId), eq(outreachDrafts.userId, userId)))
      .get();
    if (!existing) {
      response.status(404).json({ error: 'Outreach draft not found.' });
      return;
    }

    const update: Partial<typeof outreachDrafts.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.subject === 'string') update.subject = body.subject.trim().slice(0, 220) || null;
    if (body.subject === null) update.subject = null;
    if (typeof body.body === 'string') {
      const trimmed = body.body.trim();
      if (!trimmed) {
        response.status(400).json({ error: 'Draft message body cannot be empty.' });
        return;
      }
      update.body = trimmed.slice(0, 4000);
    }
    if (typeof body.recipientLabel === 'string' && body.recipientLabel.trim()) {
      update.recipientLabel = body.recipientLabel.trim().slice(0, 160);
    }
    if (typeof body.recipientTarget === 'string') {
      update.recipientTarget = body.recipientTarget.trim().slice(0, 500) || null;
    }
    if (body.recipientTarget === null) update.recipientTarget = null;
    if (typeof body.status === 'string') {
      if (!VALID_DRAFT_STATUSES.has(body.status)) {
        response.status(400).json({ error: 'Invalid draft review status.' });
        return;
      }
      update.status = body.status as typeof outreachDrafts.$inferInsert.status;
      update.reviewedAt = new Date();
    }

    db.update(outreachDrafts)
      .set(update)
      .where(and(eq(outreachDrafts.id, draftId), eq(outreachDrafts.userId, userId)))
      .run();

    const updated = db.select().from(outreachDrafts).where(eq(outreachDrafts.id, draftId)).get();
    response.status(200).json({
      draft: updated
        ? {
            id: updated.id,
            status: updated.status,
            subject: updated.subject,
            body: updated.body,
            recipientLabel: updated.recipientLabel,
            recipientTarget: updated.recipientTarget,
            targetKind: classifyDraftTarget(updated.recipientTarget, updated.channel),
            reviewedAt: updated.reviewedAt?.toISOString() ?? null,
          }
        : null,
    });
  });

  router.post('/drafts/:id/send-email', async (request, response) => {
    const userId = request.auth!.id;
    const draftId = request.params.id;
    const body = isRecord(request.body) ? request.body : {};

    const draft = db
      .select()
      .from(outreachDrafts)
      .where(and(eq(outreachDrafts.id, draftId), eq(outreachDrafts.userId, userId)))
      .get();

    if (!draft) {
      response.status(404).json({ error: 'Outreach draft not found.' });
      return;
    }
    if (draft.status !== 'approved') {
      response.status(400).json({ error: 'Human approval required: click "Accept & approve" on this draft before sending.' });
      return;
    }

    const toEmail = (typeof body.recipientEmail === 'string' && body.recipientEmail.trim())
      ? body.recipientEmail.trim()
      : (draft.recipientTarget ?? '').trim();

    if (!isValidEmailAddress(toEmail)) {
      response.status(400).json({ error: 'Enter a valid recipient email address before sending.' });
      return;
    }

    const runtime = getUserRuntimeConfig(userId);
    const attachPrimaryResume = body.attachPrimaryResume !== false;
    let attachment: { storageRoot: string; storageKey: string; originalFilename: string; mimeType: string } | null = null;

    if (attachPrimaryResume) {
      const primaryResume = db
        .select()
        .from(resumeDocuments)
        .where(and(eq(resumeDocuments.userId, userId), eq(resumeDocuments.isPrimary, true)))
        .get();
      if (primaryResume) {
        attachment = {
          storageRoot: resumeStorageRoot,
          storageKey: primaryResume.storageKey,
          originalFilename: primaryResume.originalFilename,
          mimeType: primaryResume.mimeType,
        };
      }
    }

    try {
      const sent = await sendApprovedEmail({
        config: runtime,
        senderDisplayName: request.auth!.displayName,
        to: toEmail,
        subject: draft.subject || `Application: ${draft.roleTitle} at ${draft.companyName}`,
        text: draft.body,
        attachment,
      });

      db.update(outreachDrafts)
        .set({
          status: 'sent_externally',
          recipientTarget: toEmail,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(outreachDrafts.id, draftId), eq(outreachDrafts.userId, userId)))
        .run();

      response.status(200).json({
        sent: true,
        messageId: sent.messageId,
        attachedFilename: attachment?.originalFilename ?? null,
      });
    } catch (cause) {
      response.status(400).json({
        error: cause instanceof Error ? cause.message : 'Failed to send email via SMTP.',
      });
    }
  });

  // --- Research Runs ---

  router.get('/runs', (request, response) => {
    const runs = listRecentRuns(db, request.auth!.id).map((r) => ({
      id: r.id,
      mode: r.mode,
      status: r.status,
      isLiveInProcess: isRunActive(r.id),
      config: safeParseJson(r.configJson, {}),
      checkpoint: safeParseJson(r.checkpointJson, {}),
      jobsScanned: r.jobsScanned,
      jobsMatched: r.jobsMatched,
      contactsFound: r.contactsFound,
      draftsCreated: r.draftsCreated,
      logs: safeParseJson<Array<{ at: string; level: string; message: string }>>(r.logsJson, []),
      errorMessage: r.errorMessage,
      startedAt: r.startedAt?.toISOString() ?? null,
      finishedAt: r.finishedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
    response.status(200).json({ runs });
  });

  router.post('/runs', (request, response) => {
    const userId = request.auth!.id;
    const runtime = getUserRuntimeConfig(userId);
    const body = isRecord(request.body) ? request.body : {};
    const mode = body.mode === 'overnight' ? 'overnight' : 'quick';
    const maxDurationMinutes =
      typeof body.maxDurationMinutes === 'number' && Number.isFinite(body.maxDurationMinutes)
        ? Math.max(1, Math.min(480, Math.round(body.maxDurationMinutes)))
        : mode === 'overnight' ? 360 : 8;
    const maxJobsToSave =
      typeof body.maxJobsToSave === 'number' && Number.isFinite(body.maxJobsToSave)
        ? Math.max(5, Math.min(500, Math.round(body.maxJobsToSave)))
        : mode === 'overnight' ? 150 : 40;

    const customBoards: DiscoveryRunConfig['customBoards'] = [];
    if (Array.isArray(body.customBoards)) {
      for (const item of body.customBoards.slice(0, 15)) {
        if (!isRecord(item)) continue;
        const provider = item.provider === 'lever' ? 'lever' : item.provider === 'ashby' ? 'ashby' : item.provider === 'greenhouse' ? 'greenhouse' : null;
        const token = typeof item.token === 'string' ? item.token.trim() : '';
        const companyName = typeof item.companyName === 'string' ? item.companyName.trim() : token;
        if (provider && token) customBoards.push({ provider, token, companyName });
      }
    }

    const defaultFirecrawlBudget = runtime.firecrawlApiKey ? (mode === 'overnight' ? 15 : 5) : 0;
    const config: DiscoveryRunConfig = {
      mode,
      maxDurationMinutes,
      maxJobsToSave,
      includeInternational: body.includeInternational !== false,
      includeNational: body.includeNational !== false,
      generateDrafts: body.generateDrafts !== false,
      firecrawlCreditBudget:
        typeof body.firecrawlCreditBudget === 'number' && Number.isFinite(body.firecrawlCreditBudget)
          ? Math.max(0, Math.min(50, Math.round(body.firecrawlCreditBudget)))
          : defaultFirecrawlBudget,
      useLocalOllama: body.useLocalOllama === true || (body.useLocalOllama === undefined && Boolean(runtime.ollamaModel)),
      customBoards,
    };

    const result = startDiscoveryRun(db, userId, config);
    response.status(result.alreadyRunning ? 200 : 202).json(result);
  });

  router.post('/runs/:id/stop', (request, response) => {
    const stopped = requestStopRun(db, request.auth!.id, request.params.id);
    if (!stopped) {
      response.status(404).json({ error: 'Active research run not found.' });
      return;
    }
    response.status(200).json({ stopping: true });
  });

  return router;
}

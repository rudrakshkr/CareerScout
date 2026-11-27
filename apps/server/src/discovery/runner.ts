import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { AppDatabase } from '@career-scout/database';
import {
  companies,
  companyContacts,
  educationEntries,
  experienceEntries,
  jobOpportunities,
  jobPreferences,
  outreachDrafts,
  preferredLocations,
  preferredRoles,
  profiles,
  projectTechnologies,
  projects,
  researchRuns,
  userSkills,
  users,
} from '@career-scout/database';
import { verifyInternationalEligibilityWithAi } from '../ai/verifiers.js';
import { getUserRuntimeConfig } from '../config/user-runtime-config.js';
import {
  CURATED_ATS_BOARDS,
  fetchArbeitnowJobs,
  fetchAshbyBoard,
  fetchFirecrawlDiscoveryJobs,
  fetchGreenhouseBoard,
  fetchHackerNewsHiringJobs,
  fetchJobicyJobs,
  fetchLeverBoard,
  fetchRemoteFirstJobs,
  fetchRemotiveJobs,
  fetchSimplifyInternships,
  unwrapRedirectUrlSync,
} from './connectors.js';
import {
  evaluateJobAgainstProfile,
  normalizeCompanyName,
  userStrictlyTargetsInternships,
} from './matcher.js';
import {
  discoverCompanyContacts,
  generateGroundedDraftProposals,
  type ContactDiscoveryDiagnostics,
} from './people-and-drafts.js';
import type { DiscoveryRunConfig, RawDiscoveredJob, RunLogEntry, UserProfileContext } from './types.js';

interface ActiveRunControl {
  userId: string;
  cancelled: boolean;
}

const activeRuns = new Map<string, ActiveRunControl>();

export function isRunActive(runId: string): boolean {
  return activeRuns.has(runId);
}

export function getActiveRunForUser(userId: string): string | null {
  for (const [runId, control] of activeRuns.entries()) {
    if (control.userId === userId) return runId;
  }
  return null;
}

export function requestStopRun(db: AppDatabase, userId: string, runId: string): boolean {
  const control = activeRuns.get(runId);
  if (control && control.userId === userId) {
    control.cancelled = true;
    return true;
  }
  const existing = db
    .select({ id: researchRuns.id, status: researchRuns.status })
    .from(researchRuns)
    .where(and(eq(researchRuns.id, runId), eq(researchRuns.userId, userId)))
    .get();
  if (existing && (existing.status === 'running' || existing.status === 'queued')) {
    db.update(researchRuns)
      .set({ status: 'cancelled', finishedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(researchRuns.id, runId), eq(researchRuns.userId, userId)))
      .run();
    return true;
  }
  return false;
}

export function loadUserProfileContext(db: AppDatabase, userId: string): UserProfileContext | null {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;

  const profile = db.select().from(profiles).where(eq(profiles.userId, userId)).get();
  const skills = db.select().from(userSkills).where(eq(userSkills.userId, userId)).all();
  const userProjects = db.select().from(projects).where(eq(projects.userId, userId)).all();
  const education = db.select().from(educationEntries).where(eq(educationEntries.userId, userId)).all();
  const experience = db.select().from(experienceEntries).where(eq(experienceEntries.userId, userId)).all();
  const roles = db.select().from(preferredRoles).where(eq(preferredRoles.userId, userId)).all();
  const locations = db.select().from(preferredLocations).where(eq(preferredLocations.userId, userId)).all();
  const prefs = db.select().from(jobPreferences).where(eq(jobPreferences.userId, userId)).get() ?? null;

  const projectList = userProjects.map((project) => {
    const techs = db
      .select({ name: projectTechnologies.name })
      .from(projectTechnologies)
      .where(eq(projectTechnologies.projectId, project.id))
      .all()
      .map((t) => t.name);
    return {
      name: project.name,
      tagline: project.tagline,
      description: project.description,
      projectUrl: project.projectUrl,
      repositoryUrl: project.repositoryUrl,
      technologies: techs,
    };
  });

  return {
    userId: user.id,
    displayName: user.displayName,
    email: user.email,
    currentTitle: profile?.currentTitle ?? null,
    headline: profile?.headline ?? null,
    locationCity: profile?.locationCity ?? null,
    locationCountry: profile?.locationCountry ?? null,
    portfolioUrl: profile?.portfolioUrl ?? null,
    githubUrl: profile?.githubUrl ?? null,
    linkedinUrl: profile?.linkedinUrl ?? null,
    skills: skills.map((s) => ({ name: s.name, category: s.category, isHighlighted: s.isHighlighted })),
    projects: projectList,
    education: education.map((e) => ({
      institution: e.institution,
      degree: e.degree,
      fieldOfStudy: e.fieldOfStudy,
      graduationYear: e.graduationYear,
      isCurrent: e.isCurrent,
    })),
    experience: experience.map((x) => ({
      companyName: x.companyName,
      jobTitle: x.jobTitle,
      employmentType: x.employmentType,
    })),
    preferredRoles: roles.map((r) => ({
      title: r.title,
      category: r.category,
      seniority: r.seniority,
      priority: r.priority,
    })),
    preferredLocations: locations.map((l) => ({
      city: l.city,
      region: l.region,
      country: l.country,
      priority: l.priority,
    })),
    preferences: prefs
      ? {
          minimumSalary: prefs.minimumSalary,
          maximumSalary: prefs.maximumSalary,
          salaryCurrency: prefs.salaryCurrency,
          salaryPeriod: prefs.salaryPeriod,
          paidPreference: prefs.paidPreference,
          workArrangement: prefs.workArrangement,
          willingToRelocate: prefs.willingToRelocate,
        }
      : null,
  };
}

function upsertCompany(db: AppDatabase, userId: string, job: RawDiscoveredJob): string {
  const normalized = normalizeCompanyName(job.companyName) || job.companyName.trim().toLowerCase();
  const existing = db
    .select({ id: companies.id, websiteUrl: companies.websiteUrl })
    .from(companies)
    .where(and(eq(companies.userId, userId), eq(companies.normalizedName, normalized)))
    .get();

  if (existing) {
    if (job.careersUrl || (job.companyWebsite && !existing.websiteUrl)) {
      db.update(companies)
        .set({
          ...(job.careersUrl ? { careersUrl: job.careersUrl } : {}),
          ...(job.companyWebsite && !existing.websiteUrl ? { websiteUrl: job.companyWebsite } : {}),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, existing.id))
        .run();
    }
    return existing.id;
  }

  const id = randomUUID();
  db.insert(companies)
    .values({
      id,
      userId,
      name: job.companyName.trim().slice(0, 140),
      normalizedName: normalized.slice(0, 140),
      websiteUrl: job.companyWebsite ?? null,
      careersUrl: job.careersUrl ?? null,
      atsProvider: job.atsProvider ?? 'other',
      atsBoardToken: job.atsBoardToken ?? null,
      headquarters: job.locationText?.slice(0, 120) ?? null,
    })
    .run();
  return id;
}

export async function persistJobWithContactsAndDrafts(
  db: AppDatabase,
  profile: UserProfileContext,
  rawJob: RawDiscoveredJob,
  options: {
    forceAccept?: boolean;
    generateDrafts: boolean;
    allowExternalContactLookup: boolean;
    firecrawlApiKey?: string | null;
    githubToken?: string | null;
    useLocalOllama: boolean;
    ollamaBaseUrl?: string;
    ollamaModel?: string | null;
  },
): Promise<{
  accepted: boolean;
  isNew: boolean;
  jobId: string | null;
  contactsAdded: number;
  draftsAdded: number;
  firecrawlCreditsUsed: number;
  rejectionReason: string | null;
  diagnostics: ContactDiscoveryDiagnostics | null;
}> {
  const cleanJob: RawDiscoveredJob = {
    ...rawJob,
    sourceUrl: unwrapRedirectUrlSync(rawJob.sourceUrl),
    applyUrl: unwrapRedirectUrlSync(rawJob.applyUrl ?? rawJob.sourceUrl),
  };

  const evaluated = evaluateJobAgainstProfile(cleanJob, profile);
  if (!evaluated.accepted && !options.forceAccept) {
    return {
      accepted: false,
      isNew: false,
      jobId: null,
      contactsAdded: 0,
      draftsAdded: 0,
      firecrawlCreditsUsed: 0,
      rejectionReason: evaluated.rejectionReason,
      diagnostics: null,
    };
  }

  const existing = db
    .select({ id: jobOpportunities.id })
    .from(jobOpportunities)
    .where(and(eq(jobOpportunities.userId, profile.userId), eq(jobOpportunities.fingerprint, evaluated.fingerprint)))
    .get();

  if (existing) {
    db.update(jobOpportunities)
      .set({ updatedAt: new Date() })
      .where(eq(jobOpportunities.id, existing.id))
      .run();
    return {
      accepted: true,
      isNew: false,
      jobId: existing.id,
      contactsAdded: 0,
      draftsAdded: 0,
      firecrawlCreditsUsed: 0,
      rejectionReason: null,
      diagnostics: null,
    };
  }

  const companyId = upsertCompany(db, profile.userId, cleanJob);
  const companyRow = db
    .select({ websiteUrl: companies.websiteUrl })
    .from(companies)
    .where(eq(companies.id, companyId))
    .get();
  if (!cleanJob.companyWebsite && companyRow?.websiteUrl) {
    cleanJob.companyWebsite = companyRow.websiteUrl;
  }

  const jobId = randomUUID();
  const score = evaluated.accepted ? evaluated.matchScore : Math.max(65, evaluated.matchScore);
  const reasons = evaluated.matchReasons.length > 0
    ? evaluated.matchReasons
    : ['Manually imported by user for review'];

  db.insert(jobOpportunities)
    .values({
      id: jobId,
      userId: profile.userId,
      companyId,
      fingerprint: evaluated.fingerprint,
      title: cleanJob.title.trim().slice(0, 180),
      companyName: cleanJob.companyName.trim().slice(0, 140),
      sourceName: cleanJob.sourceName,
      sourceUrl: cleanJob.sourceUrl,
      applyUrl: cleanJob.applyUrl ?? cleanJob.sourceUrl,
      locationText: cleanJob.locationText?.trim().slice(0, 140) ?? null,
      countryScope: evaluated.countryScope,
      workArrangement: evaluated.workArrangement,
      employmentType: evaluated.employmentType,
      compensationStatus: evaluated.compensationStatus,
      salaryText: cleanJob.salaryText?.trim().slice(0, 100) ?? null,
      description: cleanJob.description?.slice(0, 5000) ?? null,
      matchedRoleTitle: evaluated.matchedRoleTitle ?? profile.preferredRoles[0]?.title ?? null,
      matchScore: score,
      matchReasonsJson: JSON.stringify(reasons),
      matchedSkillsJson: JSON.stringify(evaluated.matchedSkills),
      missingSkillsJson: JSON.stringify(evaluated.missingSkills),
      verificationStatus: evaluated.verificationStatus,
      applicationStatus: options.forceAccept ? 'saved' : 'none',
      postedAt: cleanJob.postedAt ?? null,
      discoveredAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  let contactsAdded = 0;
  let draftsAdded = 0;
  let firecrawlCreditsUsed = 0;
  let diagnostics: ContactDiscoveryDiagnostics | null = null;

  if (options.generateDrafts) {
    const ollamaOpts = {
      enabled: options.useLocalOllama,
      baseUrl: options.ollamaBaseUrl || 'http://127.0.0.1:11434',
      model: options.ollamaModel ?? null,
    };

    const discovery = await discoverCompanyContacts(cleanJob, {
      deepLookup: options.allowExternalContactLookup,
      firecrawlApiKey: options.firecrawlApiKey ?? null,
      githubToken: options.githubToken ?? null,
      ollama: ollamaOpts,
    });
    firecrawlCreditsUsed = discovery.firecrawlCreditsUsed;
    diagnostics = discovery.diagnostics;

    if (discovery.diagnostics.resolvedDomain && !companyRow?.websiteUrl) {
      db.update(companies)
        .set({ websiteUrl: `https://${discovery.diagnostics.resolvedDomain}`, updatedAt: new Date() })
        .where(eq(companies.id, companyId))
        .run();
    }

    const contactIds: string[] = [];
    for (const contact of discovery.contacts) {
      const contactId = randomUUID();
      db.insert(companyContacts)
        .values({
          id: contactId,
          userId: profile.userId,
          companyId,
          jobId,
          companyName: cleanJob.companyName.trim().slice(0, 140),
          fullName: contact.fullName.slice(0, 120),
          roleTitle: contact.roleTitle?.slice(0, 140) ?? null,
          contactType: contact.contactType,
          email: contact.email,
          profileUrl: contact.profileUrl,
          platform: contact.platform,
          sourceUrl: contact.sourceUrl,
          sourceNote: contact.sourceNote.slice(0, 500),
          confidence: contact.confidence,
          lastVerifiedAt: new Date(),
        })
        .run();
      contactIds.push(contactId);
      contactsAdded += 1;
    }

    const proposals = await generateGroundedDraftProposals(
      cleanJob,
      evaluated.matchedSkills,
      discovery.contacts,
      profile,
      ollamaOpts,
      score,
    );

    for (const proposal of proposals) {
      const linkedContactId =
        proposal.contactIndex !== null && contactIds[proposal.contactIndex]
          ? contactIds[proposal.contactIndex]
          : null;
      db.insert(outreachDrafts)
        .values({
          id: randomUUID(),
          userId: profile.userId,
          jobId,
          contactId: linkedContactId,
          companyName: cleanJob.companyName.trim().slice(0, 140),
          roleTitle: cleanJob.title.trim().slice(0, 180),
          channel: proposal.channel,
          recipientLabel: proposal.recipientLabel.slice(0, 160),
          recipientTarget: proposal.recipientTarget?.slice(0, 500) ?? null,
          subject: proposal.subject?.slice(0, 220) ?? null,
          body: proposal.body.slice(0, 4000),
          groundingFactsJson: JSON.stringify(proposal.groundingFacts),
          status: 'pending_review',
        })
        .run();
      draftsAdded += 1;
    }
  }

  return {
    accepted: true,
    isNew: true,
    jobId,
    contactsAdded,
    draftsAdded,
    firecrawlCreditsUsed,
    rejectionReason: null,
    diagnostics,
  };
}

async function sleepCancelable(ms: number, control: ActiveRunControl): Promise<void> {
  const step = 500;
  let elapsed = 0;
  while (elapsed < ms && !control.cancelled) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(step, ms - elapsed)));
    elapsed += step;
  }
}

export function startDiscoveryRun(
  db: AppDatabase,
  userId: string,
  config: DiscoveryRunConfig,
): { runId: string; alreadyRunning: boolean } {
  const existingRunId = getActiveRunForUser(userId);
  if (existingRunId) return { runId: existingRunId, alreadyRunning: true };

  const runId = randomUUID();
  const initialLogs: RunLogEntry[] = [
    {
      at: new Date().toISOString(),
      level: 'info',
      message:
        config.mode === 'overnight'
          ? `Started Overnight Deep Researcher (50+ India/Global ATS boards + Firecrawl v2 + Real-People Waterfall & Backfill, cap: ${config.maxJobsToSave} matches).`
          : `Started Quick Scan (fast internship feeds + top 16 India/Global ATS boards + real-people lookup, cap: ${config.maxJobsToSave} matches).`,
    },
  ];

  db.insert(researchRuns)
    .values({
      id: runId,
      userId,
      mode: config.mode,
      status: 'running',
      configJson: JSON.stringify(config),
      checkpointJson: JSON.stringify({ stage: 'initializing' }),
      logsJson: JSON.stringify(initialLogs),
      startedAt: new Date(),
    })
    .run();

  const control: ActiveRunControl = { userId, cancelled: false };
  activeRuns.set(runId, control);

  void executeDiscoveryLoop(db, runId, userId, config, control, initialLogs);
  return { runId, alreadyRunning: false };
}

async function executeDiscoveryLoop(
  db: AppDatabase,
  runId: string,
  userId: string,
  config: DiscoveryRunConfig,
  control: ActiveRunControl,
  logs: RunLogEntry[],
): Promise<void> {
  let jobsScanned = 0;
  let jobsMatched = 0;
  let contactsFound = 0;
  let draftsCreated = 0;
  let deepCompanyLookups = 0;
  let firecrawlCreditsLeft = Math.max(0, config.firecrawlCreditBudget);
  let firecrawlHaltedReason: string | null = null;
  const deadline = Date.now() + Math.max(1, config.maxDurationMinutes) * 60_000;

  const pushLog = (level: RunLogEntry['level'], message: string, checkpoint?: Record<string, unknown>) => {
    logs.push({ at: new Date().toISOString(), level, message });
    if (logs.length > 120) logs.splice(0, logs.length - 120);
    db.update(researchRuns)
      .set({
        jobsScanned,
        jobsMatched,
        contactsFound,
        draftsCreated,
        logsJson: JSON.stringify(logs),
        ...(checkpoint ? { checkpointJson: JSON.stringify(checkpoint) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(researchRuns.id, runId))
      .run();
  };

  try {
    const profile = loadUserProfileContext(db, userId);
    if (!profile) throw new Error('Could not load user profile context.');

    const runtimeConfig = getUserRuntimeConfig(userId);
    const internOnly = userStrictlyTargetsInternships(profile);
    const searchTerms = profile.preferredRoles.map((r) => r.title).filter(Boolean);
    const homeCountry = profile.locationCountry || profile.preferredLocations[0]?.country || 'India';
    const ollamaOpts = {
      enabled: config.useLocalOllama,
      baseUrl: runtimeConfig.ollamaBaseUrl,
      model: runtimeConfig.ollamaModel,
    };

    // Reserve ~60% of Firecrawl credits specifically for finding real people & company domains
    const fcJobBudget = runtimeConfig.firecrawlApiKey && firecrawlCreditsLeft > 0
      ? config.mode === 'overnight'
        ? Math.max(1, Math.min(10, Math.floor(firecrawlCreditsLeft * 0.4)))
        : Math.max(1, Math.min(3, Math.floor(firecrawlCreditsLeft * 0.4)))
      : 0;

    pushLog(
      'info',
      `Loaded ${profile.preferredRoles.length} target roles (${internOnly ? 'STRICT INTERNSHIP-ONLY' : 'mixed seniority'}) · Firecrawl: ${runtimeConfig.firecrawlApiKey ? `enabled (${firecrawlCreditsLeft} total credits: up to ${fcJobBudget} for jobs, rest reserved for real people)` : 'not configured'} · Ollama: ${config.useLocalOllama ? runtimeConfig.ollamaModel || 'auto-detect' : 'off'}.`,
    );

    const allBoards = [...(config.customBoards ?? []), ...CURATED_ATS_BOARDS];
    const selectedBoards = config.mode === 'quick' ? allBoards.slice(0, 16) : allBoards;

    const sourceTasks: Array<{ label: string; maxPerSource: number; run: () => Promise<RawDiscoveredJob[]> }> = [
      { label: 'RemoteFirstJobs API', maxPerSource: 20, run: () => fetchRemoteFirstJobs(internOnly) },
      { label: 'Remotive API', maxPerSource: 20, run: () => fetchRemotiveJobs(searchTerms, internOnly) },
      { label: 'Hacker News Who Is Hiring', maxPerSource: 20, run: () => fetchHackerNewsHiringJobs() },
    ];

    if (runtimeConfig.firecrawlApiKey && fcJobBudget > 0) {
      sourceTasks.push({
        label: 'Firecrawl v2 Targeted ATS & Startup Internships',
        maxPerSource: 30,
        run: async () => {
          const res = await fetchFirecrawlDiscoveryJobs({
            apiKey: runtimeConfig.firecrawlApiKey!,
            roleTitles: searchTerms.length ? searchTerms : ['Software Engineering Intern'],
            internOnly,
            includeNational: config.includeNational,
            includeInternational: config.includeInternational,
            homeCountry,
            creditBudget: fcJobBudget,
          });
          firecrawlCreditsLeft = Math.max(0, firecrawlCreditsLeft - res.creditsUsed);
          if (res.error) {
            firecrawlHaltedReason = res.error;
            pushLog('warn', `Firecrawl job search stopped: ${res.error}`);
          }
          return res.jobs;
        },
      });
    }

    for (const board of selectedBoards) {
      sourceTasks.push({
        label: `${board.companyName} (${board.provider})`,
        maxPerSource: 8,
        run: () =>
          board.provider === 'ashby'
            ? fetchAshbyBoard(board.token, board.companyName)
            : board.provider === 'greenhouse'
              ? fetchGreenhouseBoard(board.token, board.companyName)
              : fetchLeverBoard(board.token, board.companyName),
      });
    }

    sourceTasks.push({
      label: 'SimplifyJobs Active SWE Internships',
      maxPerSource: config.mode === 'overnight' ? 30 : 12,
      run: () => fetchSimplifyInternships(),
    });

    if (config.mode === 'overnight') {
      sourceTasks.push(
        { label: 'Arbeitnow Tech Board', maxPerSource: 15, run: () => fetchArbeitnowJobs() },
        { label: 'Jobicy Dev Feed', maxPerSource: 15, run: () => fetchJobicyJobs() },
      );
    }

    const researchedCompanies = new Set<string>();

    for (const task of sourceTasks) {
      if (control.cancelled || Date.now() >= deadline || jobsMatched >= config.maxJobsToSave) break;
      pushLog('info', `Scanning ${task.label}…`, { source: task.label });

      let rawJobs: RawDiscoveredJob[] = [];
      try {
        rawJobs = await task.run();
      } catch (err) {
        pushLog('warn', `${task.label} failed: ${err instanceof Error ? err.message : 'network error'}`);
        continue;
      }

      let sourceNewMatches = 0;
      for (const rawJob of rawJobs) {
        if (control.cancelled || Date.now() >= deadline || jobsMatched >= config.maxJobsToSave || sourceNewMatches >= task.maxPerSource) break;
        jobsScanned += 1;

        const preview = evaluateJobAgainstProfile(rawJob, profile);
        if (!preview.accepted) continue;
        if (!config.includeNational && preview.countryScope === 'national') continue;
        if (!config.includeInternational && preview.countryScope === 'international') continue;

        const alreadySaved = db
          .select({ id: jobOpportunities.id })
          .from(jobOpportunities)
          .where(and(eq(jobOpportunities.userId, userId), eq(jobOpportunities.fingerprint, preview.fingerprint)))
          .get();
        if (alreadySaved) continue;

        if (
          config.mode === 'overnight'
          && ollamaOpts.enabled
          && preview.countryScope !== 'national'
          && (rawJob.description?.length ?? 0) >= 80
        ) {
          const aiIntl = await verifyInternationalEligibilityWithAi({
            ollama: ollamaOpts,
            jobTitle: rawJob.title,
            companyName: rawJob.companyName,
            locationText: rawJob.locationText ?? '',
            sponsorshipNote: rawJob.sponsorshipNote ?? null,
            description: rawJob.description ?? '',
            homeCountry,
          });
          if (aiIntl && !aiIntl.eligibleFromIndia) {
            pushLog('info', `AI skipped international job "${rawJob.title}" at ${rawJob.companyName}: ${aiIntl.reason}`);
            continue;
          }
        }

        const compKey = normalizeCompanyName(rawJob.companyName);
        const isDeepOvernight = config.mode === 'overnight';
        const maxDeepLookups = isDeepOvernight ? 45 : 10;
        const allowDeepPeople = !researchedCompanies.has(compKey) && deepCompanyLookups < maxDeepLookups;
        const firecrawlKeyForPeople =
          allowDeepPeople && !firecrawlHaltedReason && firecrawlCreditsLeft > 0
            ? runtimeConfig.firecrawlApiKey
            : null;

        const result = await persistJobWithContactsAndDrafts(db, profile, rawJob, {
          forceAccept: false,
          generateDrafts: config.generateDrafts,
          allowExternalContactLookup: allowDeepPeople,
          firecrawlApiKey: firecrawlKeyForPeople,
          githubToken: runtimeConfig.githubToken,
          useLocalOllama: config.useLocalOllama,
          ollamaBaseUrl: runtimeConfig.ollamaBaseUrl,
          ollamaModel: runtimeConfig.ollamaModel,
        });

        if (result.firecrawlCreditsUsed > 0) {
          firecrawlCreditsLeft = Math.max(0, firecrawlCreditsLeft - result.firecrawlCreditsUsed);
        }
        if (result.diagnostics?.firecrawlError && !firecrawlHaltedReason) {
          firecrawlHaltedReason = result.diagnostics.firecrawlError;
          pushLog('warn', `Firecrawl people lookup paused: ${firecrawlHaltedReason}`);
        }

        if (result.accepted && result.isNew) {
          if (allowDeepPeople) {
            researchedCompanies.add(compKey);
            deepCompanyLookups += 1;
          }
          jobsMatched += 1;
          sourceNewMatches += 1;
          contactsFound += result.contactsAdded;
          draftsCreated += result.draftsAdded;
        }
      }

      pushLog(
        'info',
        `${task.label}: ${rawJobs.length} scanned -> ${sourceNewMatches} new strict matches (${contactsFound} verified current contacts, ${firecrawlCreditsLeft} Firecrawl credits left).`,
        { source: task.label, jobsScanned, jobsMatched, contactsFound, draftsCreated, firecrawlCreditsLeft },
      );

      if (config.mode === 'overnight' && !control.cancelled) {
        await sleepCancelable(1500, control);
      }
    }

    // Overnight People-Backfill Pass: revisit saved jobs that still have 0 verified contacts
    if (
      config.mode === 'overnight'
      && config.generateDrafts
      && !control.cancelled
      && Date.now() < deadline
    ) {
      const savedJobs = db
        .select()
        .from(jobOpportunities)
        .where(eq(jobOpportunities.userId, userId))
        .orderBy(desc(jobOpportunities.matchScore))
        .all();
      const existingContactRows = db
        .select({ jobId: companyContacts.jobId })
        .from(companyContacts)
        .where(eq(companyContacts.userId, userId))
        .all();
      const jobsWithContacts = new Set(existingContactRows.map((c) => c.jobId).filter(Boolean));
      const jobsNeedingPeople = savedJobs.filter((j) => !jobsWithContacts.has(j.id));

      if (jobsNeedingPeople.length > 0) {
        pushLog('info', `Starting People-Backfill Pass for ${jobsNeedingPeople.length} matched job(s) that still lack verified contacts…`, {
          stage: 'people_backfill',
        });

        const backfilledCompanies = new Set<string>();
        for (const job of jobsNeedingPeople) {
          if (control.cancelled || Date.now() >= deadline || backfilledCompanies.size >= 25) break;
          const compKey = normalizeCompanyName(job.companyName);
          if (backfilledCompanies.has(compKey)) continue;
          backfilledCompanies.add(compKey);

          const compRow = job.companyId
            ? db.select({ websiteUrl: companies.websiteUrl }).from(companies).where(eq(companies.id, job.companyId)).get()
            : null;

          const rawJob: RawDiscoveredJob = {
            sourceName: job.sourceName,
            sourceUrl: job.sourceUrl,
            applyUrl: job.applyUrl,
            title: job.title,
            companyName: job.companyName,
            companyWebsite: compRow?.websiteUrl ?? null,
            locationText: job.locationText,
            salaryText: job.salaryText,
            description: job.description,
            postedAt: job.postedAt,
          };

          const discovery = await discoverCompanyContacts(rawJob, {
            deepLookup: true,
            firecrawlApiKey: !firecrawlHaltedReason && firecrawlCreditsLeft > 0 ? runtimeConfig.firecrawlApiKey : null,
            githubToken: runtimeConfig.githubToken,
            ollama: ollamaOpts,
          });

          if (discovery.firecrawlCreditsUsed > 0) {
            firecrawlCreditsLeft = Math.max(0, firecrawlCreditsLeft - discovery.firecrawlCreditsUsed);
          }
          if (discovery.diagnostics.firecrawlError && !firecrawlHaltedReason) {
            firecrawlHaltedReason = discovery.diagnostics.firecrawlError;
            pushLog('warn', `Firecrawl backfill paused: ${firecrawlHaltedReason}`);
          }
          if (discovery.diagnostics.resolvedDomain && job.companyId && !compRow?.websiteUrl) {
            db.update(companies)
              .set({ websiteUrl: `https://${discovery.diagnostics.resolvedDomain}`, updatedAt: new Date() })
              .where(eq(companies.id, job.companyId))
              .run();
          }

          if (discovery.contacts.length > 0) {
            const contactIds: string[] = [];
            for (const contact of discovery.contacts) {
              const cid = randomUUID();
              db.insert(companyContacts)
                .values({
                  id: cid,
                  userId,
                  companyId: job.companyId,
                  jobId: job.id,
                  companyName: job.companyName,
                  fullName: contact.fullName.slice(0, 120),
                  roleTitle: contact.roleTitle?.slice(0, 140) ?? null,
                  contactType: contact.contactType,
                  email: contact.email,
                  profileUrl: contact.profileUrl,
                  platform: contact.platform,
                  sourceUrl: contact.sourceUrl,
                  sourceNote: contact.sourceNote.slice(0, 500),
                  confidence: contact.confidence,
                  lastVerifiedAt: new Date(),
                })
                .run();
              contactIds.push(cid);
              contactsFound += 1;
            }

            let matchedSkills: string[] = [];
            try {
              const parsed = JSON.parse(job.matchedSkillsJson) as unknown;
              if (Array.isArray(parsed)) matchedSkills = parsed.filter((s): s is string => typeof s === 'string');
            } catch {
              matchedSkills = [];
            }

            const proposals = await generateGroundedDraftProposals(
              rawJob,
              matchedSkills,
              discovery.contacts,
              profile,
              ollamaOpts,
              job.matchScore,
              { skipFallbackIfNoContacts: true },
            );

            for (const proposal of proposals) {
              const linkedContactId =
                proposal.contactIndex !== null && contactIds[proposal.contactIndex]
                  ? contactIds[proposal.contactIndex]
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
                  recipientLabel: proposal.recipientLabel.slice(0, 160),
                  recipientTarget: proposal.recipientTarget?.slice(0, 500) ?? null,
                  subject: proposal.subject?.slice(0, 220) ?? null,
                  body: proposal.body.slice(0, 4000),
                  groundingFactsJson: JSON.stringify(proposal.groundingFacts),
                  status: 'pending_review',
                })
                .run();
              draftsCreated += 1;
            }

            pushLog(
              'info',
              `Backfill found ${discovery.contacts.length} real contact(s) at ${job.companyName} (${discovery.diagnostics.resolvedDomain || 'no domain'}) -> drafted ${proposals.length} direct message(s).`,
            );
          } else {
            pushLog(
              'info',
              `Backfill checked ${job.companyName} (domain: ${discovery.diagnostics.resolvedDomain || 'unresolved'}, LinkedIn hits: ${discovery.diagnostics.linkedinHitsReturned}, rejected: ${discovery.diagnostics.linkedinRejected}, GitHub: ${discovery.diagnostics.githubMembersFound}).`,
            );
          }
        }
      }
    }

    const finalStatus = control.cancelled ? 'cancelled' : 'completed';
    pushLog(
      'info',
      finalStatus === 'cancelled'
        ? `Run stopped. Saved ${jobsMatched} matches, ${contactsFound} verified current contacts, and ${draftsCreated} drafts.`
        : `Research complete! All ${sourceTasks.length} sources + people-backfill finished: ${jobsScanned} scanned -> ${jobsMatched} strict matches, ${contactsFound} verified current contacts, ${draftsCreated} drafts.`,
      { stage: finalStatus },
    );

    db.update(researchRuns)
      .set({
        status: finalStatus,
        jobsScanned,
        jobsMatched,
        contactsFound,
        draftsCreated,
        logsJson: JSON.stringify(logs),
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(researchRuns.id, runId))
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Discovery run encountered an unexpected error.';
    pushLog('error', message, { stage: 'failed' });
    db.update(researchRuns)
      .set({
        status: 'failed',
        errorMessage: message,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(researchRuns.id, runId))
      .run();
  } finally {
    activeRuns.delete(runId);
  }
}

export function listRecentRuns(db: AppDatabase, userId: string) {
  return db
    .select()
    .from(researchRuns)
    .where(eq(researchRuns.userId, userId))
    .orderBy(desc(researchRuns.createdAt))
    .limit(20)
    .all();
}

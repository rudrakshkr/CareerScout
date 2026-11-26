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
} from './connectors.js';
import {
  evaluateJobAgainstProfile,
  normalizeCompanyName,
  userStrictlyTargetsInternships,
} from './matcher.js';
import { discoverCompanyContacts, generateGroundedDraftProposals } from './people-and-drafts.js';
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
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.userId, userId), eq(companies.normalizedName, normalized)))
    .get();

  if (existing) {
    if (job.careersUrl || job.companyWebsite) {
      db.update(companies)
        .set({
          ...(job.careersUrl ? { careersUrl: job.careersUrl } : {}),
          ...(job.companyWebsite ? { websiteUrl: job.companyWebsite } : {}),
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
}> {
  const evaluated = evaluateJobAgainstProfile(rawJob, profile);
  if (!evaluated.accepted && !options.forceAccept) {
    return {
      accepted: false,
      isNew: false,
      jobId: null,
      contactsAdded: 0,
      draftsAdded: 0,
      firecrawlCreditsUsed: 0,
      rejectionReason: evaluated.rejectionReason,
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
    };
  }

  const companyId = upsertCompany(db, profile.userId, rawJob);
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
      title: rawJob.title.trim().slice(0, 180),
      companyName: rawJob.companyName.trim().slice(0, 140),
      sourceName: rawJob.sourceName,
      sourceUrl: rawJob.sourceUrl,
      applyUrl: rawJob.applyUrl ?? rawJob.sourceUrl,
      locationText: rawJob.locationText?.trim().slice(0, 140) ?? null,
      countryScope: evaluated.countryScope,
      workArrangement: evaluated.workArrangement,
      employmentType: evaluated.employmentType,
      compensationStatus: evaluated.compensationStatus,
      salaryText: rawJob.salaryText?.trim().slice(0, 100) ?? null,
      description: rawJob.description?.slice(0, 5000) ?? null,
      matchedRoleTitle: evaluated.matchedRoleTitle ?? profile.preferredRoles[0]?.title ?? null,
      matchScore: score,
      matchReasonsJson: JSON.stringify(reasons),
      matchedSkillsJson: JSON.stringify(evaluated.matchedSkills),
      missingSkillsJson: JSON.stringify(evaluated.missingSkills),
      verificationStatus: evaluated.verificationStatus,
      applicationStatus: options.forceAccept ? 'saved' : 'none',
      postedAt: rawJob.postedAt ?? null,
      discoveredAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  let contactsAdded = 0;
  let draftsAdded = 0;
  let firecrawlCreditsUsed = 0;

  if (options.generateDrafts) {
    const discovery = await discoverCompanyContacts(rawJob, {
      deepLookup: options.allowExternalContactLookup,
      firecrawlApiKey: options.firecrawlApiKey ?? null,
      githubToken: options.githubToken ?? null,
    });
    firecrawlCreditsUsed = discovery.firecrawlCreditsUsed;

    const contactIds: string[] = [];
    for (const contact of discovery.contacts) {
      const contactId = randomUUID();
      db.insert(companyContacts)
        .values({
          id: contactId,
          userId: profile.userId,
          companyId,
          jobId,
          companyName: rawJob.companyName.trim().slice(0, 140),
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
      rawJob,
      evaluated.matchedSkills,
      discovery.contacts,
      profile,
      {
        enabled: options.useLocalOllama,
        baseUrl: options.ollamaBaseUrl || 'http://127.0.0.1:11434',
        model: options.ollamaModel ?? null,
      },
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
          companyName: rawJob.companyName.trim().slice(0, 140),
          roleTitle: rawJob.title.trim().slice(0, 180),
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
          ? `Started Overnight Deep Researcher (all ATS boards + Firecrawl v2 + GitHub real-people discovery, cap: ${config.maxJobsToSave} matches).`
          : `Started Quick Scan (fast internship feeds + top ATS boards + real people lookup, cap: ${config.maxJobsToSave} matches).`,
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
  const deadline = Date.now() + Math.max(1, config.maxDurationMinutes) * 60_000;

  const pushLog = (level: RunLogEntry['level'], message: string, checkpoint?: Record<string, unknown>) => {
    logs.push({ at: new Date().toISOString(), level, message });
    if (logs.length > 100) logs.splice(0, logs.length - 100);
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
    const homeCountry = profile.locationCountry || profile.preferredLocations[0]?.country || null;

    pushLog(
      'info',
      `Loaded ${profile.preferredRoles.length} target roles (${internOnly ? 'STRICT INTERNSHIP-ONLY' : 'mixed seniority'}) · Firecrawl: ${runtimeConfig.firecrawlApiKey ? `enabled (${firecrawlCreditsLeft} credit cap)` : 'not configured'} · Ollama: ${config.useLocalOllama ? runtimeConfig.ollamaModel || 'auto-detect' : 'off'}.`,
    );

    const allBoards = [...(config.customBoards ?? []), ...CURATED_ATS_BOARDS];
    const selectedBoards = config.mode === 'quick' ? allBoards.slice(0, 12) : allBoards;

    const sourceTasks: Array<{ label: string; maxPerSource: number; run: () => Promise<RawDiscoveredJob[]> }> = [
      { label: 'RemoteFirstJobs API', maxPerSource: 20, run: () => fetchRemoteFirstJobs(internOnly) },
      { label: 'Remotive API', maxPerSource: 20, run: () => fetchRemotiveJobs(searchTerms, internOnly) },
      { label: 'Hacker News Who Is Hiring', maxPerSource: 20, run: () => fetchHackerNewsHiringJobs() },
    ];

    if (runtimeConfig.firecrawlApiKey && firecrawlCreditsLeft > 0) {
      const fcJobBudget = config.mode === 'overnight'
        ? Math.max(1, Math.min(4, Math.floor(firecrawlCreditsLeft / 2)))
        : Math.min(2, firecrawlCreditsLeft);
      sourceTasks.push({
        label: 'Firecrawl v2 Targeted ATS & Internships Search',
        maxPerSource: 20,
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

        const compKey = normalizeCompanyName(rawJob.companyName);
        const isDeepOvernight = config.mode === 'overnight';
        const maxDeepLookups = isDeepOvernight ? 40 : 10;
        const allowDeepPeople = !researchedCompanies.has(compKey) && deepCompanyLookups < maxDeepLookups;
        const firecrawlKeyForPeople =
          allowDeepPeople && firecrawlCreditsLeft > 0 ? runtimeConfig.firecrawlApiKey : null;

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
        `${task.label}: ${rawJobs.length} scanned -> ${sourceNewMatches} new strict matches (${contactsFound} real contacts total).`,
        { source: task.label, jobsScanned, jobsMatched, contactsFound, draftsCreated, firecrawlCreditsLeft },
      );

      if (config.mode === 'overnight' && !control.cancelled) {
        await sleepCancelable(2000, control);
      }
    }

    const finalStatus = control.cancelled ? 'cancelled' : 'completed';
    pushLog(
      'info',
      finalStatus === 'cancelled'
        ? `Run stopped. Saved ${jobsMatched} target-role matches, ${contactsFound} real contacts, and ${draftsCreated} drafts.`
        : `Research complete! Scanned ${jobsScanned} listings -> ${jobsMatched} strict matches, ${contactsFound} real contacts, ${draftsCreated} focused drafts.`,
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

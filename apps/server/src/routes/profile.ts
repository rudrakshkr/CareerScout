import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppDatabase } from '@career-scout/database';
import {
  educationEntries,
  experienceEntries,
  jobPreferences,
  preferredLocations,
  preferredRoles,
  profiles,
  projectTechnologies,
  projects,
  resumeDocuments,
  userSkills,
  users,
} from '@career-scout/database';
import { requireAuth } from '../middleware/auth.js';

const educationLevels = ['high_school', 'diploma', 'associate', 'bachelor', 'master', 'doctorate', 'bootcamp', 'other'] as const;
const employmentTypes = ['internship', 'full_time', 'part_time', 'contract', 'freelance', 'volunteer', 'apprenticeship', 'other'] as const;
const workArrangements = ['onsite', 'hybrid', 'remote'] as const;
const skillCategories = ['programming_language', 'frontend', 'backend', 'database', 'tool', 'cloud', 'testing', 'soft_skill', 'other'] as const;
const skillProficiencies = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
const paidPreferences = ['paid_only', 'paid_preferred', 'any'] as const;
const preferenceWorkArrangements = ['remote_only', 'remote_preferred', 'hybrid_or_remote', 'any'] as const;
const roleCategories = ['frontend', 'backend', 'full_stack', 'software_engineering', 'devops', 'data', 'mobile', 'other'] as const;
const seniorityLevels = ['internship', 'entry_level', 'junior', 'mid_level', 'senior', 'any'] as const;
const onboardingSteps = ['personal', 'education', 'experience', 'projects', 'skills', 'preferences', 'resume'] as const;

type Body = Record<string, unknown>;
type Parsed<T> = { ok: true; present: boolean; value: T | null } | { ok: false; present: boolean; value: null };

function isRecord(value: unknown): value is Body {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseText(body: Body, key: string, maxLength: number, required = false): Parsed<string> {
  if (!Object.hasOwn(body, key)) return { ok: !required, present: false, value: null };
  const raw = body[key];
  if (raw === null) return { ok: !required, present: true, value: null };
  if (typeof raw !== 'string') return { ok: false, present: true, value: null };
  const value = raw.trim();
  if (!value) return { ok: !required, present: true, value: null };
  if ([...value].length > maxLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) {
    return { ok: false, present: true, value: null };
  }
  return { ok: true, present: true, value };
}

function parseUrl(body: Body, key: string): Parsed<string> {
  const parsed = parseText(body, key, 2048);
  if (!parsed.ok || parsed.value === null) return parsed;
  try {
    const url = new URL(parsed.value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, present: true, value: null };
    return parsed;
  } catch {
    return { ok: false, present: true, value: null };
  }
}

function parseDate(body: Body, key: string): Parsed<string> {
  const parsed = parseText(body, key, 10);
  if (!parsed.ok || parsed.value === null) return parsed;
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/u.test(parsed.value)) return { ok: false, present: true, value: null };
  return parsed;
}

function parseBoolean(body: Body, key: string): Parsed<boolean> {
  if (!Object.hasOwn(body, key)) return { ok: true, present: false, value: null };
  return typeof body[key] === 'boolean'
    ? { ok: true, present: true, value: body[key] as boolean }
    : { ok: false, present: true, value: null };
}

function parseInteger(body: Body, key: string, min: number, max: number): Parsed<number> {
  if (!Object.hasOwn(body, key)) return { ok: true, present: false, value: null };
  const value = body[key];
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? { ok: true, present: true, value }
    : { ok: false, present: true, value: null };
}

function parseReal(body: Body, key: string, min: number, max: number): Parsed<number> {
  if (!Object.hasOwn(body, key)) return { ok: true, present: false, value: null };
  const value = body[key];
  if (value === null) return { ok: true, present: true, value: null };
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? { ok: true, present: true, value }
    : { ok: false, present: true, value: null };
}

function parseEnum<const T extends readonly string[]>(body: Body, key: string, allowed: T): Parsed<T[number]> {
  const parsed = parseText(body, key, 60);
  if (!parsed.ok || parsed.value === null) return parsed;
  return (allowed as readonly string[]).includes(parsed.value)
    ? { ok: true, present: true, value: parsed.value as T[number] }
    : { ok: false, present: true, value: null };
}

function parseStringArray(body: Body, key: string, maxItems: number, maxLength: number): Parsed<string[]> {
  if (!Object.hasOwn(body, key)) return { ok: true, present: false, value: null };
  const raw = body[key];
  if (!Array.isArray(raw) || raw.length > maxItems) return { ok: false, present: true, value: null };
  const values: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') return { ok: false, present: true, value: null };
    const value = item.trim();
    if (!value || [...value].length > maxLength) return { ok: false, present: true, value: null };
    const keyValue = value.toLocaleLowerCase();
    if (!seen.has(keyValue)) {
      seen.add(keyValue);
      values.push(value);
    }
  }
  return { ok: true, present: true, value: values };
}

function invalidBody(response: Response, message = 'Please check the submitted information.') {
  return response.status(400).json({ error: message });
}

function getBody(value: unknown, response: Response): Body | null {
  if (!isRecord(value)) {
    invalidBody(response, 'A JSON object is required.');
    return null;
  }
  return value;
}

function getUserId(request: Request): string {
  // Every route in this router is protected by requireAuth.
  return request.auth!.id;
}

const requireSameOrigin = (request: Request, response: Response, next: NextFunction): void => {
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
};

export function createProfileRouter(db: AppDatabase): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(requireSameOrigin);
  router.use(requireAuth(db));

  router.get('/', (request, response) => {
    const userId = getUserId(request);
    const user = db.select({ id: users.id, email: users.email, displayName: users.displayName })
      .from(users).where(eq(users.id, userId)).get();
    const profile = db.select().from(profiles).where(eq(profiles.userId, userId)).get();
    if (!user || !profile) {
      response.status(404).json({ error: 'Profile not found.' });
      return;
    }

    const education = db.select().from(educationEntries).where(eq(educationEntries.userId, userId)).orderBy(asc(educationEntries.sortOrder)).all();
    const experience = db.select().from(experienceEntries).where(eq(experienceEntries.userId, userId)).orderBy(asc(experienceEntries.sortOrder)).all();
    const projectRows = db.select().from(projects).where(eq(projects.userId, userId)).orderBy(asc(projects.sortOrder)).all();
    const projectIds = projectRows.map((project) => project.id);
    const technologyRows = projectIds.length
      ? db.select().from(projectTechnologies).where(inArray(projectTechnologies.projectId, projectIds)).orderBy(asc(projectTechnologies.sortOrder)).all()
      : [];
    const projectList = projectRows.map((project) => ({
      ...project,
      technologies: technologyRows.filter((technology) => technology.projectId === project.id).map((technology) => ({ id: technology.id, name: technology.name, sortOrder: technology.sortOrder })),
    }));
    const skills = db.select().from(userSkills).where(eq(userSkills.userId, userId)).orderBy(asc(userSkills.sortOrder)).all();
    const preferences = db.select().from(jobPreferences).where(eq(jobPreferences.userId, userId)).get() ?? null;
    const roles = db.select().from(preferredRoles).where(eq(preferredRoles.userId, userId)).orderBy(asc(preferredRoles.priority)).all();
    const locations = db.select().from(preferredLocations).where(eq(preferredLocations.userId, userId)).orderBy(asc(preferredLocations.priority)).all();
    const resumes = db.select({
      id: resumeDocuments.id,
      originalFilename: resumeDocuments.originalFilename,
      mimeType: resumeDocuments.mimeType,
      fileSizeBytes: resumeDocuments.fileSizeBytes,
      isPrimary: resumeDocuments.isPrimary,
      processingStatus: resumeDocuments.processingStatus,
      processingError: resumeDocuments.processingError,
      uploadedAt: resumeDocuments.uploadedAt,
      updatedAt: resumeDocuments.updatedAt,
    }).from(resumeDocuments).where(eq(resumeDocuments.userId, userId)).orderBy(asc(resumeDocuments.uploadedAt)).all();

    response.status(200).json({ user, profile, education, experience, projects: projectList, skills, preferences, preferredRoles: roles, preferredLocations: locations, resumes });
  });

  router.patch('/personal', (request, response) => {
    const body = getBody(request.body, response);
    if (!body) return;
    const userId = getUserId(request);
    const displayName = parseText(body, 'displayName', 80);
    const phone = parseText(body, 'phone', 40);
    const locationCity = parseText(body, 'locationCity', 120);
    const locationCountry = parseText(body, 'locationCountry', 120);
    const headline = parseText(body, 'headline', 180);
    const portfolioUrl = parseUrl(body, 'portfolioUrl');
    const linkedinUrl = parseUrl(body, 'linkedinUrl');
    const githubUrl = parseUrl(body, 'githubUrl');
    const currentTitle = parseText(body, 'currentTitle', 120);
    const results = [displayName, phone, locationCity, locationCountry, headline, portfolioUrl, linkedinUrl, githubUrl, currentTitle];
    if (results.some((field) => !field.ok)) return invalidBody(response);
    if (displayName.present && displayName.value === null) return invalidBody(response, 'Display name cannot be empty.');
    if (!results.some((field) => field.present)) return invalidBody(response, 'No supported profile fields were provided.');

    const profileUpdate: Partial<typeof profiles.$inferInsert> = { updatedAt: new Date() };
    if (phone.present) profileUpdate.phone = phone.value;
    if (locationCity.present) profileUpdate.locationCity = locationCity.value;
    if (locationCountry.present) profileUpdate.locationCountry = locationCountry.value;
    if (headline.present) profileUpdate.headline = headline.value;
    if (portfolioUrl.present) profileUpdate.portfolioUrl = portfolioUrl.value;
    if (linkedinUrl.present) profileUpdate.linkedinUrl = linkedinUrl.value;
    if (githubUrl.present) profileUpdate.githubUrl = githubUrl.value;
    if (currentTitle.present) profileUpdate.currentTitle = currentTitle.value;

    db.transaction((transaction) => {
      if (displayName.present && displayName.value !== null) {
        transaction.update(users).set({ displayName: displayName.value, updatedAt: new Date() }).where(eq(users.id, userId)).run();
      }
      if (Object.keys(profileUpdate).length > 1) {
        transaction.update(profiles).set(profileUpdate).where(eq(profiles.userId, userId)).run();
      }
    });

    const user = db.select({ id: users.id, email: users.email, displayName: users.displayName }).from(users).where(eq(users.id, userId)).get();
    const profile = db.select().from(profiles).where(eq(profiles.userId, userId)).get();
    response.status(200).json({ user, profile });
  });

  router.post('/education', (request, response) => {
    const body = getBody(request.body, response);
    if (!body) return;
    const institution = parseText(body, 'institution', 200, true);
    const educationLevel = parseEnum(body, 'educationLevel', educationLevels);
    const degree = parseText(body, 'degree', 160);
    const fieldOfStudy = parseText(body, 'fieldOfStudy', 160);
    const startDate = parseDate(body, 'startDate');
    const endDate = parseDate(body, 'endDate');
    const graduationYear = parseInteger(body, 'graduationYear', 1900, 2200);
    const grade = parseText(body, 'grade', 80);
    const description = parseText(body, 'description', 4000);
    const isCurrent = parseBoolean(body, 'isCurrent');
    const sortOrder = parseInteger(body, 'sortOrder', 0, 10000);
    if ([institution, educationLevel, degree, fieldOfStudy, startDate, endDate, graduationYear, grade, description, isCurrent, sortOrder].some((field) => !field.ok)) return invalidBody(response);
    const id = randomUUID();
    db.insert(educationEntries).values({
      id, userId: getUserId(request), institution: institution.value!,
      educationLevel: educationLevel.value as typeof educationEntries.$inferInsert.educationLevel,
      degree: degree.value, fieldOfStudy: fieldOfStudy.value, startDate: startDate.value, endDate: endDate.value,
      graduationYear: graduationYear.value, grade: grade.value, description: description.value,
      isCurrent: isCurrent.value ?? false, sortOrder: sortOrder.value ?? 0,
    }).run();
    const entry = db.select().from(educationEntries).where(eq(educationEntries.id, id)).get();
    response.status(201).json({ entry });
  });

  router.patch('/education/:id', (request, response) => {
    const body = getBody(request.body, response);
    if (!body) return;
    const userId = getUserId(request);
    const id = request.params.id;
    const existing = db.select({ id: educationEntries.id }).from(educationEntries).where(and(eq(educationEntries.id, id), eq(educationEntries.userId, userId))).get();
    if (!existing) return response.status(404).json({ error: 'Education entry not found.' });
    const institution = parseText(body, 'institution', 200);
    const educationLevel = parseEnum(body, 'educationLevel', educationLevels);
    const degree = parseText(body, 'degree', 160);
    const fieldOfStudy = parseText(body, 'fieldOfStudy', 160);
    const startDate = parseDate(body, 'startDate');
    const endDate = parseDate(body, 'endDate');
    const graduationYear = parseInteger(body, 'graduationYear', 1900, 2200);
    const grade = parseText(body, 'grade', 80);
    const description = parseText(body, 'description', 4000);
    const isCurrent = parseBoolean(body, 'isCurrent');
    const sortOrder = parseInteger(body, 'sortOrder', 0, 10000);
    const fields = [institution, educationLevel, degree, fieldOfStudy, startDate, endDate, graduationYear, grade, description, isCurrent, sortOrder];
    if (fields.some((field) => !field.ok)) return invalidBody(response);
    if (!fields.some((field) => field.present)) return invalidBody(response, 'No education fields were provided.');
    const update: Partial<typeof educationEntries.$inferInsert> = { updatedAt: new Date() };
    if (institution.present) { if (institution.value === null) return invalidBody(response, 'Institution cannot be empty.'); update.institution = institution.value; }
    if (educationLevel.present) update.educationLevel = educationLevel.value as typeof educationEntries.$inferInsert.educationLevel;
    if (degree.present) update.degree = degree.value;
    if (fieldOfStudy.present) update.fieldOfStudy = fieldOfStudy.value;
    if (startDate.present) update.startDate = startDate.value;
    if (endDate.present) update.endDate = endDate.value;
    if (graduationYear.present) update.graduationYear = graduationYear.value;
    if (grade.present) update.grade = grade.value;
    if (description.present) update.description = description.value;
    if (isCurrent.present) update.isCurrent = isCurrent.value!;
    if (sortOrder.present) update.sortOrder = sortOrder.value!;
    db.update(educationEntries).set(update).where(and(eq(educationEntries.id, id), eq(educationEntries.userId, userId))).run();
    const entry = db.select().from(educationEntries).where(eq(educationEntries.id, id)).get();
    response.status(200).json({ entry });
  });

  router.delete('/education/:id', (request, response) => {
    const result = db.delete(educationEntries).where(and(eq(educationEntries.id, request.params.id), eq(educationEntries.userId, getUserId(request)))).run();
    if (result.changes === 0) return response.status(404).json({ error: 'Education entry not found.' });
    response.status(204).end();
  });

  router.post('/experience', (request, response) => {
    const body = getBody(request.body, response);
    if (!body) return;
    const companyName = parseText(body, 'companyName', 200, true);
    const jobTitle = parseText(body, 'jobTitle', 160, true);
    const employmentType = parseEnum(body, 'employmentType', employmentTypes);
    const location = parseText(body, 'location', 160);
    const workArrangement = parseEnum(body, 'workArrangement', workArrangements);
    const startDate = parseDate(body, 'startDate');
    const endDate = parseDate(body, 'endDate');
    const isCurrent = parseBoolean(body, 'isCurrent');
    const description = parseText(body, 'description', 6000);
    const achievements = parseText(body, 'achievements', 6000);
    const sortOrder = parseInteger(body, 'sortOrder', 0, 10000);
    const fields = [companyName, jobTitle, employmentType, location, workArrangement, startDate, endDate, isCurrent, description, achievements, sortOrder];
    if (fields.some((field) => !field.ok)) return invalidBody(response);
    const id = randomUUID();
    db.insert(experienceEntries).values({
      id, userId: getUserId(request), companyName: companyName.value!, jobTitle: jobTitle.value!,
      employmentType: employmentType.value as typeof experienceEntries.$inferInsert.employmentType,
      location: location.value,
      workArrangement: workArrangement.value as typeof experienceEntries.$inferInsert.workArrangement,
      startDate: startDate.value, endDate: endDate.value, isCurrent: isCurrent.value ?? false,
      description: description.value, achievements: achievements.value, sortOrder: sortOrder.value ?? 0,
    }).run();
    const entry = db.select().from(experienceEntries).where(eq(experienceEntries.id, id)).get();
    response.status(201).json({ entry });
  });

  router.patch('/experience/:id', (request, response) => {
    const body = getBody(request.body, response);
    if (!body) return;
    const userId = getUserId(request);
    const id = request.params.id;
    const existing = db.select({ id: experienceEntries.id }).from(experienceEntries).where(and(eq(experienceEntries.id, id), eq(experienceEntries.userId, userId))).get();
    if (!existing) return response.status(404).json({ error: 'Experience entry not found.' });
    const companyName = parseText(body, 'companyName', 200);
    const jobTitle = parseText(body, 'jobTitle', 160);
    const employmentType = parseEnum(body, 'employmentType', employmentTypes);
    const location = parseText(body, 'location', 160);
    const workArrangement = parseEnum(body, 'workArrangement', workArrangements);
    const startDate = parseDate(body, 'startDate');
    const endDate = parseDate(body, 'endDate');
    const isCurrent = parseBoolean(body, 'isCurrent');
    const description = parseText(body, 'description', 6000);
    const achievements = parseText(body, 'achievements', 6000);
    const sortOrder = parseInteger(body, 'sortOrder', 0, 10000);
    const fields = [companyName, jobTitle, employmentType, location, workArrangement, startDate, endDate, isCurrent, description, achievements, sortOrder];
    if (fields.some((field) => !field.ok)) return invalidBody(response);
    if (!fields.some((field) => field.present)) return invalidBody(response, 'No experience fields were provided.');
    const update: Partial<typeof experienceEntries.$inferInsert> = { updatedAt: new Date() };
    if (companyName.present) { if (companyName.value === null) return invalidBody(response, 'Company name cannot be empty.'); update.companyName = companyName.value; }
    if (jobTitle.present) { if (jobTitle.value === null) return invalidBody(response, 'Job title cannot be empty.'); update.jobTitle = jobTitle.value; }
    if (employmentType.present) update.employmentType = employmentType.value as typeof experienceEntries.$inferInsert.employmentType;
    if (location.present) update.location = location.value;
    if (workArrangement.present) update.workArrangement = workArrangement.value as typeof experienceEntries.$inferInsert.workArrangement;
    if (startDate.present) update.startDate = startDate.value;
    if (endDate.present) update.endDate = endDate.value;
    if (isCurrent.present) update.isCurrent = isCurrent.value!;
    if (description.present) update.description = description.value;
    if (achievements.present) update.achievements = achievements.value;
    if (sortOrder.present) update.sortOrder = sortOrder.value!;
    db.update(experienceEntries).set(update).where(and(eq(experienceEntries.id, id), eq(experienceEntries.userId, userId))).run();
    const entry = db.select().from(experienceEntries).where(eq(experienceEntries.id, id)).get();
    response.status(200).json({ entry });
  });

  router.delete('/experience/:id', (request, response) => {
    const result = db.delete(experienceEntries).where(and(eq(experienceEntries.id, request.params.id), eq(experienceEntries.userId, getUserId(request)))).run();
    if (result.changes === 0) return response.status(404).json({ error: 'Experience entry not found.' });
    response.status(204).end();
  });

  router.post('/projects', (request, response) => {
    const body = getBody(request.body, response);
    if (!body) return;
    const name = parseText(body, 'name', 180, true);
    const tagline = parseText(body, 'tagline', 240);
    const description = parseText(body, 'description', 6000);
    const role = parseText(body, 'role', 160);
    const projectUrl = parseUrl(body, 'projectUrl');
    const repositoryUrl = parseUrl(body, 'repositoryUrl');
    const startDate = parseDate(body, 'startDate');
    const endDate = parseDate(body, 'endDate');
    const isOngoing = parseBoolean(body, 'isOngoing');
    const sortOrder = parseInteger(body, 'sortOrder', 0, 10000);
    const technologies = parseStringArray(body, 'technologies', 40, 60);
    const fields = [name, tagline, description, role, projectUrl, repositoryUrl, startDate, endDate, isOngoing, sortOrder, technologies];
    if (fields.some((field) => !field.ok)) return invalidBody(response);
    const id = randomUUID();
    db.transaction((transaction) => {
      transaction.insert(projects).values({
        id, userId: getUserId(request), name: name.value!, tagline: tagline.value, description: description.value,
        role: role.value, projectUrl: projectUrl.value, repositoryUrl: repositoryUrl.value,
        startDate: startDate.value, endDate: endDate.value, isOngoing: isOngoing.value ?? false,
        sortOrder: sortOrder.value ?? 0,
      }).run();
      if (technologies.value?.length) {
        transaction.insert(projectTechnologies).values(technologies.value.map((technology, index) => ({ id: randomUUID(), projectId: id, name: technology, sortOrder: index }))).run();
      }
    });
    const entry = db.select().from(projects).where(eq(projects.id, id)).get();
    const tech = db.select().from(projectTechnologies).where(eq(projectTechnologies.projectId, id)).orderBy(asc(projectTechnologies.sortOrder)).all();
    response.status(201).json({ entry: { ...entry, technologies: tech } });
  });

  router.patch('/projects/:id', (request, response) => {
    const body = getBody(request.body, response);
    if (!body) return;
    const userId = getUserId(request);
    const id = request.params.id;
    const existing = db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, id), eq(projects.userId, userId))).get();
    if (!existing) return response.status(404).json({ error: 'Project not found.' });
    const name = parseText(body, 'name', 180);
    const tagline = parseText(body, 'tagline', 240);
    const description = parseText(body, 'description', 6000);
    const role = parseText(body, 'role', 160);
    const projectUrl = parseUrl(body, 'projectUrl');
    const repositoryUrl = parseUrl(body, 'repositoryUrl');
    const startDate = parseDate(body, 'startDate');
    const endDate = parseDate(body, 'endDate');
    const isOngoing = parseBoolean(body, 'isOngoing');
    const sortOrder = parseInteger(body, 'sortOrder', 0, 10000);
    const technologies = parseStringArray(body, 'technologies', 40, 60);
    const fields = [name, tagline, description, role, projectUrl, repositoryUrl, startDate, endDate, isOngoing, sortOrder, technologies];
    if (fields.some((field) => !field.ok)) return invalidBody(response);
    if (!fields.some((field) => field.present)) return invalidBody(response, 'No project fields were provided.');
    const update: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
    if (name.present) { if (name.value === null) return invalidBody(response, 'Project name cannot be empty.'); update.name = name.value; }
    if (tagline.present) update.tagline = tagline.value;
    if (description.present) update.description = description.value;
    if (role.present) update.role = role.value;
    if (projectUrl.present) update.projectUrl = projectUrl.value;
    if (repositoryUrl.present) update.repositoryUrl = repositoryUrl.value;
    if (startDate.present) update.startDate = startDate.value;
    if (endDate.present) update.endDate = endDate.value;
    if (isOngoing.present) update.isOngoing = isOngoing.value!;
    if (sortOrder.present) update.sortOrder = sortOrder.value!;
    db.transaction((transaction) => {
      if (Object.keys(update).length > 1) transaction.update(projects).set(update).where(and(eq(projects.id, id), eq(projects.userId, userId))).run();
      if (technologies.present) {
        transaction.delete(projectTechnologies).where(eq(projectTechnologies.projectId, id)).run();
        if (technologies.value?.length) {
          transaction.insert(projectTechnologies).values(technologies.value.map((technology, index) => ({ id: randomUUID(), projectId: id, name: technology, sortOrder: index }))).run();
        }
      }
    });
    const entry = db.select().from(projects).where(eq(projects.id, id)).get();
    const tech = db.select().from(projectTechnologies).where(eq(projectTechnologies.projectId, id)).orderBy(asc(projectTechnologies.sortOrder)).all();
    response.status(200).json({ entry: { ...entry, technologies: tech } });
  });

  router.delete('/projects/:id', (request, response) => {
    const result = db.delete(projects).where(and(eq(projects.id, request.params.id), eq(projects.userId, getUserId(request)))).run();
    if (result.changes === 0) return response.status(404).json({ error: 'Project not found.' });
    response.status(204).end();
  });

  router.post('/skills', (request, response) => {
    const body = getBody(request.body, response);
    if (!body) return;
    const name = parseText(body, 'name', 80, true);
    const category = parseEnum(body, 'category', skillCategories);
    const proficiency = parseEnum(body, 'proficiency', skillProficiencies);
    const yearsExperience = parseReal(body, 'yearsExperience', 0, 80);
    const isHighlighted = parseBoolean(body, 'isHighlighted');
    const sortOrder = parseInteger(body, 'sortOrder', 0, 10000);
    if ([name, category, proficiency, yearsExperience, isHighlighted, sortOrder].some((field) => !field.ok)) return invalidBody(response);
    const userId = getUserId(request);
    const duplicate = db.select({ id: userSkills.id }).from(userSkills)
      .where(and(eq(userSkills.userId, userId), sql`lower(${userSkills.name}) = ${name.value!.toLocaleLowerCase()}`)).get();
    if (duplicate) return response.status(409).json({ error: 'This skill has already been added.' });
    const id = randomUUID();
    db.insert(userSkills).values({
      id, userId, name: name.value!, category: (category.value ?? 'other') as typeof userSkills.$inferInsert.category,
      proficiency: proficiency.value as typeof userSkills.$inferInsert.proficiency,
      yearsExperience: yearsExperience.value, isHighlighted: isHighlighted.value ?? false, sortOrder: sortOrder.value ?? 0,
    }).run();
    const entry = db.select().from(userSkills).where(eq(userSkills.id, id)).get();
    response.status(201).json({ entry });
  });

  router.patch('/skills/:id', (request, response) => {
    const body = getBody(request.body, response);
    if (!body) return;
    const userId = getUserId(request);
    const id = request.params.id;
    const existing = db.select({ id: userSkills.id }).from(userSkills).where(and(eq(userSkills.id, id), eq(userSkills.userId, userId))).get();
    if (!existing) return response.status(404).json({ error: 'Skill not found.' });
    const name = parseText(body, 'name', 80);
    const category = parseEnum(body, 'category', skillCategories);
    const proficiency = parseEnum(body, 'proficiency', skillProficiencies);
    const yearsExperience = parseReal(body, 'yearsExperience', 0, 80);
    const isHighlighted = parseBoolean(body, 'isHighlighted');
    const sortOrder = parseInteger(body, 'sortOrder', 0, 10000);
    const fields = [name, category, proficiency, yearsExperience, isHighlighted, sortOrder];
    if (fields.some((field) => !field.ok)) return invalidBody(response);
    if (!fields.some((field) => field.present)) return invalidBody(response, 'No skill fields were provided.');
    if (name.present) {
      if (name.value === null) return invalidBody(response, 'Skill name cannot be empty.');
      const duplicate = db.select({ id: userSkills.id }).from(userSkills).where(and(
        eq(userSkills.userId, userId), sql`${userSkills.id} <> ${id}`,
        sql`lower(${userSkills.name}) = ${name.value.toLocaleLowerCase()}`,
      )).get();
      if (duplicate) return response.status(409).json({ error: 'This skill has already been added.' });
    }
    const update: Partial<typeof userSkills.$inferInsert> = { updatedAt: new Date() };
    if (name.present) update.name = name.value!;
    if (category.present) update.category = category.value as typeof userSkills.$inferInsert.category;
    if (proficiency.present) update.proficiency = proficiency.value as typeof userSkills.$inferInsert.proficiency;
    if (yearsExperience.present) update.yearsExperience = yearsExperience.value;
    if (isHighlighted.present) update.isHighlighted = isHighlighted.value!;
    if (sortOrder.present) update.sortOrder = sortOrder.value!;
    db.update(userSkills).set(update).where(and(eq(userSkills.id, id), eq(userSkills.userId, userId))).run();
    const entry = db.select().from(userSkills).where(eq(userSkills.id, id)).get();
    response.status(200).json({ entry });
  });

  router.delete('/skills/:id', (request, response) => {
    const result = db.delete(userSkills).where(and(eq(userSkills.id, request.params.id), eq(userSkills.userId, getUserId(request)))).run();
    if (result.changes === 0) return response.status(404).json({ error: 'Skill not found.' });
    response.status(204).end();
  });

  router.put('/preferences', (request, response) => {
    const body = getBody(request.body, response);
    if (!body) return;
    const minimumSalary = parseInteger(body, 'minimumSalary', 0, 2_000_000_000);
    const maximumSalary = parseInteger(body, 'maximumSalary', 0, 2_000_000_000);
    const salaryCurrency = parseText(body, 'salaryCurrency', 3);
    const salaryPeriod = parseEnum(body, 'salaryPeriod', ['hourly', 'monthly', 'yearly'] as const);
    const paidPreference = parseEnum(body, 'paidPreference', paidPreferences);
    const workArrangement = parseEnum(body, 'workArrangement', preferenceWorkArrangements);
    const willingToRelocate = parseBoolean(body, 'willingToRelocate');
    if ([minimumSalary, maximumSalary, salaryCurrency, salaryPeriod, paidPreference, workArrangement, willingToRelocate].some((field) => !field.ok)) return invalidBody(response);
    const min = minimumSalary.value;
    const max = maximumSalary.value;
    if (min !== null && max !== null && min > max) return invalidBody(response, 'Minimum salary cannot exceed maximum salary.');
    if (salaryCurrency.value !== null && !/^[A-Za-z]{3}$/u.test(salaryCurrency.value)) return invalidBody(response, 'Salary currency must be a three-letter currency code.');

    let roles: Array<{ id: string; userId: string; title: string; category: typeof preferredRoles.$inferInsert.category; seniority: typeof preferredRoles.$inferInsert.seniority; priority: number }> | null = null;
    if (Object.hasOwn(body, 'roles')) {
      if (!Array.isArray(body.roles) || body.roles.length > 30) return invalidBody(response, 'Roles must be an array of at most 30 items.');
      roles = [];
      for (let index = 0; index < body.roles.length; index += 1) {
        const item = body.roles[index];
        if (!isRecord(item)) return invalidBody(response, 'Each preferred role must be an object.');
        const title = parseText(item, 'title', 120, true);
        const category = parseEnum(item, 'category', roleCategories);
        const seniority = parseEnum(item, 'seniority', seniorityLevels);
        const priority = parseInteger(item, 'priority', 0, 10000);
        if ([title, category, seniority, priority].some((field) => !field.ok)) return invalidBody(response, 'A preferred role contains invalid fields.');
        roles.push({ id: randomUUID(), userId: getUserId(request), title: title.value!, category: category.value as typeof preferredRoles.$inferInsert.category, seniority: (seniority.value ?? 'any') as typeof preferredRoles.$inferInsert.seniority, priority: priority.value ?? index });
      }
    }

    let locations: Array<{ id: string; userId: string; city: string | null; region: string | null; country: string; priority: number }> | null = null;
    if (Object.hasOwn(body, 'locations')) {
      if (!Array.isArray(body.locations) || body.locations.length > 50) return invalidBody(response, 'Locations must be an array of at most 50 items.');
      locations = [];
      for (let index = 0; index < body.locations.length; index += 1) {
        const item = body.locations[index];
        if (!isRecord(item)) return invalidBody(response, 'Each preferred location must be an object.');
        const city = parseText(item, 'city', 120);
        const region = parseText(item, 'region', 120);
        const country = parseText(item, 'country', 120, true);
        const priority = parseInteger(item, 'priority', 0, 10000);
        if ([city, region, country, priority].some((field) => !field.ok)) return invalidBody(response, 'A preferred location contains invalid fields.');
        locations.push({ id: randomUUID(), userId: getUserId(request), city: city.value, region: region.value, country: country.value!, priority: priority.value ?? index });
      }
    }

    const userId = getUserId(request);
    db.transaction((transaction) => {
      transaction.insert(jobPreferences).values({
        userId, minimumSalary: min, maximumSalary: max,
        salaryCurrency: salaryCurrency.value?.toUpperCase() ?? null,
        salaryPeriod: salaryPeriod.value as typeof jobPreferences.$inferInsert.salaryPeriod,
        paidPreference: (paidPreference.value ?? 'paid_preferred') as typeof jobPreferences.$inferInsert.paidPreference,
        workArrangement: (workArrangement.value ?? 'any') as typeof jobPreferences.$inferInsert.workArrangement,
        willingToRelocate: willingToRelocate.value ?? false, updatedAt: new Date(),
      }).onConflictDoUpdate({ target: jobPreferences.userId, set: {
        minimumSalary: min, maximumSalary: max, salaryCurrency: salaryCurrency.value?.toUpperCase() ?? null,
        salaryPeriod: salaryPeriod.value as typeof jobPreferences.$inferInsert.salaryPeriod,
        paidPreference: (paidPreference.value ?? 'paid_preferred') as typeof jobPreferences.$inferInsert.paidPreference,
        workArrangement: (workArrangement.value ?? 'any') as typeof jobPreferences.$inferInsert.workArrangement,
        willingToRelocate: willingToRelocate.value ?? false, updatedAt: new Date(),
      } }).run();
      if (roles !== null) {
        transaction.delete(preferredRoles).where(eq(preferredRoles.userId, userId)).run();
        if (roles.length) transaction.insert(preferredRoles).values(roles).run();
      }
      if (locations !== null) {
        transaction.delete(preferredLocations).where(eq(preferredLocations.userId, userId)).run();
        if (locations.length) transaction.insert(preferredLocations).values(locations).run();
      }
    });
    response.status(200).json({ saved: true });
  });

  router.patch('/onboarding', (request, response) => {
    const body = getBody(request.body, response);
    if (!body) return;
    const currentStep = parseEnum(body, 'currentStep', onboardingSteps);
    if (!currentStep.ok || !currentStep.present || currentStep.value === null) return invalidBody(response, 'A valid onboarding step is required.');
    const userId = getUserId(request);
    const currentProfile = db.select({ onboardingStatus: profiles.onboardingStatus }).from(profiles).where(eq(profiles.userId, userId)).get();
    if (!currentProfile) return response.status(404).json({ error: 'Profile not found.' });
    db.update(profiles).set({
      onboardingCurrentStep: currentStep.value,
      onboardingStatus: currentProfile.onboardingStatus === 'completed' ? 'completed' : 'in_progress',
      updatedAt: new Date(),
    }).where(eq(profiles.userId, userId)).run();
    const profile = db.select().from(profiles).where(eq(profiles.userId, userId)).get();
    response.status(200).json({ profile });
  });

  router.post('/onboarding/complete', (request, response) => {
    const userId = getUserId(request);

    const result = db.transaction((transaction) => {
      const user = transaction.select({
        id: users.id,
        displayName: users.displayName,
      }).from(users).where(eq(users.id, userId)).get();
      const profile = transaction.select().from(profiles).where(eq(profiles.userId, userId)).get();

      if (!user || !profile) return { kind: 'not_found' as const };

      const hasEducation = transaction.select({ id: educationEntries.id })
        .from(educationEntries).where(eq(educationEntries.userId, userId)).limit(1).get() !== undefined;
      const hasExperience = transaction.select({ id: experienceEntries.id })
        .from(experienceEntries).where(eq(experienceEntries.userId, userId)).limit(1).get() !== undefined;
      const hasProject = transaction.select({ id: projects.id })
        .from(projects).where(eq(projects.userId, userId)).limit(1).get() !== undefined;
      const hasSkill = transaction.select({ id: userSkills.id })
        .from(userSkills).where(eq(userSkills.userId, userId)).limit(1).get() !== undefined;
      const hasPreferences = transaction.select({ userId: jobPreferences.userId })
        .from(jobPreferences).where(eq(jobPreferences.userId, userId)).limit(1).get() !== undefined;
      const hasPreferredRole = transaction.select({ id: preferredRoles.id })
        .from(preferredRoles).where(eq(preferredRoles.userId, userId)).limit(1).get() !== undefined;
      const hasPreferredLocation = transaction.select({ id: preferredLocations.id })
        .from(preferredLocations).where(eq(preferredLocations.userId, userId)).limit(1).get() !== undefined;

      const missingRequirements: Array<{ code: string; message: string }> = [];
      if (!user.displayName.trim()) {
        missingRequirements.push({ code: 'personal_details', message: 'Add your name in Personal details.' });
      }
      if (!hasEducation && !hasExperience && !hasProject) {
        missingRequirements.push({
          code: 'background',
          message: 'Add at least one education entry, work experience entry, or project.',
        });
      }
      if (!hasSkill) {
        missingRequirements.push({ code: 'skills', message: 'Add at least one skill.' });
      }
      if (!hasPreferences) {
        missingRequirements.push({ code: 'preferences', message: 'Save your job preferences.' });
      }
      if (!hasPreferredRole) {
        missingRequirements.push({ code: 'preferred_roles', message: 'Add at least one preferred job role.' });
      }
      if (!hasPreferredLocation) {
        missingRequirements.push({ code: 'preferred_locations', message: 'Add at least one preferred job location.' });
      }

      if (missingRequirements.length > 0) {
        return { kind: 'incomplete' as const, missingRequirements };
      }

      const completedAt = profile.onboardingCompletedAt ?? new Date();
      transaction.update(profiles).set({
        onboardingStatus: 'completed',
        onboardingCurrentStep: 'resume',
        onboardingCompletedAt: completedAt,
        updatedAt: new Date(),
      }).where(eq(profiles.userId, userId)).run();

      const updatedProfile = transaction.select().from(profiles)
        .where(eq(profiles.userId, userId)).get();
      return { kind: 'completed' as const, profile: updatedProfile };
    });

    if (result.kind === 'not_found') {
      response.status(404).json({ error: 'Profile not found.' });
      return;
    }
    if (result.kind === 'incomplete') {
      response.status(400).json({
        completed: false,
        error: 'Your profile is missing required onboarding information.',
        missingRequirements: result.missingRequirements,
      });
      return;
    }

    response.status(200).json({
      completed: true,
      profile: result.profile,
      missingRequirements: [],
    });
  });

  return router;
}

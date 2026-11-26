import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import {
  createDatabase,
  educationEntries,
  preferredRoles,
  profiles,
  projects,
  projectTechnologies,
  userSkills,
  users,
} from '../packages/database/dist/index.js';
import { createSession, SESSION_COOKIE_NAME } from '../apps/server/dist/auth/session.js';
import { createDiscoveryRouter } from '../apps/server/dist/routes/discovery.js';
import {
  buildMasterCoverLetterPack,
  selectBestProjectsForJob,
  violatesMasterStyle,
} from '../apps/server/dist/discovery/cover-letter.js';

function applyMigrations(client) {
  const drizzleDir = path.resolve('packages/database/drizzle');
  const files = fs.readdirSync(drizzleDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(drizzleDir, file), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim();
      if (trimmed) client.exec(trimmed);
    }
  }
}

const masterProfile = {
  userId: 'u1',
  displayName: 'Rudraksh Kumar',
  email: 'rudrakshkumar2908@gmail.com',
  currentTitle: 'Full-Stack Software Engineer',
  headline: 'B.Tech CSE undergraduate building end-to-end web apps',
  locationCity: 'Palampur',
  locationCountry: 'India',
  portfolioUrl: 'https://rudraksh-portfolio-sage.vercel.app/',
  githubUrl: 'https://github.com/rudrakshkr',
  linkedinUrl: 'https://linkedin.com/in/rudraksh-kumar2908/',
  skills: [
    { name: 'React', category: 'frontend', isHighlighted: true },
    { name: 'TypeScript', category: 'programming_language', isHighlighted: true },
    { name: 'Node.js', category: 'backend', isHighlighted: true },
    { name: 'PostgreSQL', category: 'database', isHighlighted: true },
    { name: 'Socket.IO', category: 'backend', isHighlighted: false },
    { name: 'Razorpay', category: 'tool', isHighlighted: false },
    { name: 'Gemini API', category: 'other', isHighlighted: false },
  ],
  projects: [
    {
      name: 'BrandFlight',
      tagline: 'Pre-Publication Multimodal Content Auditing Platform',
      description: 'Audits marketing copy and images against brand rules, masks PII before LLM review, and checks WCAG 2.1 contrast.',
      projectUrl: 'https://brand-flight.vercel.app/',
      repositoryUrl: 'https://github.com/rudrakshkr/brandflight',
      technologies: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Prisma', 'Gemini API'],
    },
    {
      name: 'Nexus Messaging App',
      tagline: 'Real-Time Messaging Platform',
      description: 'Real-time chat with online presence, delivery/read states, optimistic updates, cursor-based pagination, and JWT permissions.',
      projectUrl: 'https://nexus-messaging-app.vercel.app/',
      repositoryUrl: 'https://github.com/rudrakshkr/nexus',
      technologies: ['React', 'Node.js', 'Express', 'Socket.IO', 'PostgreSQL', 'Prisma'],
    },
    {
      name: 'PahariKnits',
      tagline: 'Full-Stack E-Commerce Platform',
      description: 'Apparel storefront with passwordless email OTP sign-in, Razorpay checkout verification, cart-aware inventory, and refund workflows.',
      projectUrl: 'https://pahariknits.vercel.app/',
      repositoryUrl: 'https://github.com/rudrakshkr/pahariknits',
      technologies: ['React', 'Node.js', 'Express', 'PostgreSQL', 'Prisma', 'Razorpay'],
    },
  ],
  education: [
    {
      institution: 'Sri Sai University',
      degree: 'B.Tech',
      fieldOfStudy: 'Computer Science and Engineering',
      graduationYear: 2028,
      isCurrent: true,
    },
  ],
  experience: [],
  preferredRoles: [{ title: 'Full-Stack Developer Intern', category: 'full_stack', seniority: 'internship', priority: 0 }],
  preferredLocations: [{ city: 'Delhi', region: 'NCR', country: 'India', priority: 0 }],
  preferences: null,
};

test('selects strictly 1-2 projects matching company domain (never dumps all 3)', () => {
  const aiPick = selectBestProjectsForJob(
    masterProfile.projects,
    'AI Product Engineering Intern building LLM content governance and multimodal validation pipelines',
    'AI compliance SaaS platform',
  );
  assert.ok(aiPick.length >= 1 && aiPick.length <= 2);
  assert.equal(aiPick[0].project.name, 'BrandFlight');

  const fintechPick = selectBestProjectsForJob(
    masterProfile.projects,
    'Backend Software Engineer Intern working on payments, checkout verification, and merchant order workflows',
    'Fintech payments gateway',
  );
  assert.ok(fintechPick.length >= 1 && fintechPick.length <= 2);
  assert.equal(fintechPick[0].project.name, 'PahariKnits');

  const realtimePick = selectBestProjectsForJob(
    masterProfile.projects,
    'Full-Stack Intern building real-time WebSocket collaboration and chat presence systems',
    'Collaborative workspace messaging',
  );
  assert.ok(realtimePick.length >= 1 && realtimePick.length <= 2);
  assert.equal(realtimePick[0].project.name, 'Nexus Messaging App');
});

test('cover letter follows Master Instructions (no em dashes, no banned phrases, no forced AI on payments roles)', async () => {
  const pack = await buildMasterCoverLetterPack({
    job: {
      title: 'Backend Software Engineer Intern',
      companyName: 'PayFlow',
      description: 'PayFlow helps retail merchants automate checkout payments, order verification, and refund reconciliation using Node.js and PostgreSQL.',
      sourceUrl: 'https://boards.greenhouse.io/payflow/jobs/42',
    },
    matchedSkills: ['Node.js', 'PostgreSQL'],
    profile: masterProfile,
    firecrawlApiKey: null,
    ollama: { enabled: false, baseUrl: 'http://127.0.0.1:11434', model: null },
  });

  assert.equal(violatesMasterStyle(pack.coverLetter), false, `Style check failed:\n${pack.coverLetter}`);
  assert.ok(!pack.coverLetter.includes('—'), 'Must not contain em dashes');
  assert.ok(pack.coverLetter.includes('PahariKnits'), 'Should highlight PahariKnits for payments role');
  assert.ok(!pack.coverLetter.includes('Gemini API'), 'Should not force AI tools into non-AI payments role');
  assert.ok(pack.highlightedProjects.length <= 2);
});

test('POST /jobs/:id/tailor and /jobs/:id/save-cover-letter persist draft as pending_review', async () => {
  const conn = createDatabase(':memory:');
  applyMigrations(conn.client);

  const u1 = '00000000-0000-4000-8000-000000000077';
  conn.db.insert(users).values({ id: u1, email: 'cl@example.invalid', passwordHash: 'x', displayName: 'Rudraksh Kumar' }).run();
  conn.db.insert(profiles).values({ userId: u1, locationCountry: 'India', githubUrl: 'https://github.com/rudrakshkr' }).run();
  conn.db.insert(preferredRoles).values({ id: 'r77', userId: u1, title: 'Full-Stack Developer Intern', category: 'full_stack', seniority: 'internship', priority: 0 }).run();
  conn.db.insert(userSkills).values({ id: 's77', userId: u1, name: 'TypeScript', category: 'programming_language' }).run();
  conn.db.insert(educationEntries).values({ id: 'e77', userId: u1, institution: 'Sri Sai University', degree: 'B.Tech', fieldOfStudy: 'Computer Science and Engineering', isCurrent: true }).run();
  conn.db.insert(projects).values({ id: 'p77', userId: u1, name: 'BrandFlight', tagline: 'Multimodal Content Auditing Platform', description: 'Audits marketing copy and images against brand rules with PII masking.' }).run();
  conn.db.insert(projectTechnologies).values({ id: 'pt77', projectId: 'p77', name: 'TypeScript' }).run();

  const session = createSession(conn.db, u1);
  const app = express();
  app.use(express.json());
  app.use('/api/discovery', createDiscoveryRouter(conn.db));

  const server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/api/discovery`;
    const headers = { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${session.token}` };

    const imp = await (await fetch(`${base}/jobs/import`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'AI Product Engineer Intern',
        companyName: 'VerityAI',
        sourceUrl: 'https://boards.greenhouse.io/verityai/jobs/1',
        locationText: 'Remote, India',
        description: 'VerityAI builds automated content auditing and compliance tools for teams using TypeScript and LLMs.',
      }),
    })).json();

    const tailorRes = await fetch(`${base}/jobs/${imp.jobId}/tailor`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ researchCompany: false, useLocalOllama: false }),
    });
    assert.equal(tailorRes.status, 200);
    const { pack } = await tailorRes.json();
    assert.ok(pack.coverLetter.includes('BrandFlight'));
    assert.ok(pack.wordCount >= 120);

    const saveRes = await fetch(`${base}/jobs/${imp.jobId}/save-cover-letter`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ coverLetter: pack.coverLetter, groundingFacts: ['Project: BrandFlight'] }),
    });
    assert.equal(saveRes.status, 201);
    const { draftId } = await saveRes.json();
    assert.ok(draftId);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    conn.close();
  }
});

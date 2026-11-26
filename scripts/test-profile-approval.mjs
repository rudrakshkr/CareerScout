import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { createDatabase, profiles, users } from '../packages/database/dist/index.js';
import { createSession, SESSION_COOKIE_NAME } from '../apps/server/dist/auth/session.js';
import { createProfileRouter } from '../apps/server/dist/routes/profile.js';
import { extractResumeFacts } from '../apps/dashboard/src/onboarding/resume-fact-extractor.ts';

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

const sampleResume = `
Rudraksh Kumar
Full-Stack Software Developer
Palampur, Himachal Pradesh, India | +91 7678669859
[GitHub](https://github.com/rudrakshkr) | [LinkedIn](https://linkedin.com/in/rudraksh-kumar2908/) | [Portfolio](https://rudraksh-portfolio-sage.vercel.app/)

Summary
Full-stack developer building production web applications with React, TypeScript, Node.js, and PostgreSQL, focused on clean architecture, reliable APIs, and local-first tools for real users.

Experience
Software Engineer Intern | Acme Labs | Remote | May 2026 – Aug 2026
• Built REST APIs with Express and PostgreSQL.
• Improved dashboard query performance by 40%.

Education
Sri Sai University, Palampur
B.Tech Computer Science and Engineering | 2024 – 2028
CGPA: 8.6

Projects
PahariKnits — Full-Stack E-Commerce Storefront | [Live](https://pahariknits.vercel.app) | [GitHub](https://github.com/rudrakshkr/pahariknits)
Tech Stack: React, Node.js, Express, PostgreSQL, Razorpay
• Built an apparel storefront with passwordless email OTP sign-in and Razorpay checkout/payment verification, linking purchases to order records.
• Added cart-aware inventory and order tracking to keep stock aligned with purchases and reduce overselling, plus a returns/refund workflow.

Skills
Languages: JavaScript, TypeScript, SQL
Frontend: React, Tailwind CSS, HTML, CSS
Backend: Node.js, Express, Prisma
Tools: Git, Linux, Docker
`;

test('every extracted resume fact saves cleanly through real /api/profile routes', async () => {
  const conn = createDatabase(':memory:');
  applyMigrations(conn.client);

  const userId = '00000000-0000-4000-8000-000000000001';
  conn.db.insert(users).values({
    id: userId,
    email: 'approval-test@example.invalid',
    passwordHash: 'not-used-in-session-test',
    displayName: 'Rudraksh Kumar',
  }).run();
  conn.db.insert(profiles).values({ userId }).run();
  const session = createSession(conn.db, userId);

  const app = express();
  app.use(express.json());
  app.use('/api/profile', createProfileRouter(conn.db));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    const headers = {
      'Content-Type': 'application/json',
      Cookie: `${SESSION_COOKIE_NAME}=${session.token}`,
    };

    const facts = extractResumeFacts(sampleResume);
    assert.ok(facts.length >= 10, `Expected >= 10 extracted facts, got ${facts.length}`);

    const postJson = async (url, method, body) => {
      const res = await fetch(`${base}${url}`, { method, headers, body: JSON.stringify(body) });
      const text = await res.text();
      assert.ok(res.ok, `${method} ${url} failed with HTTP ${res.status}: ${text}\nPayload: ${JSON.stringify(body)}`);
      return JSON.parse(text);
    };

    // Personal
    const personalPatch = {};
    for (const f of facts) {
      if (['phone', 'currentTitle', 'locationCity', 'locationCountry', 'headline', 'portfolioUrl', 'linkedinUrl', 'githubUrl'].includes(f.kind)) {
        personalPatch[f.kind] = f.value;
      }
    }
    await postJson('/api/profile/personal', 'PATCH', personalPatch);

    // Experience
    for (const f of facts.filter((x) => x.kind === 'experience')) {
      await postJson('/api/profile/experience', 'POST', {
        companyName: f.companyName,
        jobTitle: f.jobTitle,
        employmentType: f.employmentType ?? null,
        location: f.experienceLocation ?? null,
        workArrangement: f.workArrangement ?? null,
        startDate: f.experienceStartDate ?? null,
        endDate: f.experienceIsCurrent ? null : f.experienceEndDate ?? null,
        isCurrent: Boolean(f.experienceIsCurrent),
        description: f.experienceDescription ?? null,
        achievements: f.achievements ?? null,
        sortOrder: 0,
      });
    }

    // Education
    for (const f of facts.filter((x) => x.kind === 'education')) {
      await postJson('/api/profile/education', 'POST', {
        institution: f.institution,
        educationLevel: f.educationLevel ?? null,
        degree: f.degree ?? null,
        fieldOfStudy: f.fieldOfStudy ?? null,
        startDate: f.startDate ?? null,
        endDate: f.isCurrent ? null : f.endDate ?? null,
        graduationYear: f.graduationYear ?? null,
        grade: f.grade ?? null,
        description: f.educationDescription ?? null,
        isCurrent: Boolean(f.isCurrent),
        sortOrder: 0,
      });
    }

    // Projects
    for (const f of facts.filter((x) => x.kind === 'project')) {
      await postJson('/api/profile/projects', 'POST', {
        name: f.projectName ?? f.value,
        tagline: f.tagline ?? null,
        description: f.projectDescription ?? null,
        role: f.role ?? null,
        projectUrl: f.projectUrl ?? null,
        repositoryUrl: f.repositoryUrl ?? null,
        startDate: f.projectStartDate ?? null,
        endDate: f.isOngoing ? null : f.projectEndDate ?? null,
        isOngoing: Boolean(f.isOngoing),
        sortOrder: 0,
        technologies: f.technologies ?? [],
      });
    }

    // Skills
    let skillIdx = 0;
    for (const f of facts.filter((x) => x.kind === 'skill')) {
      await postJson('/api/profile/skills', 'POST', {
        name: f.value,
        category: f.category ?? 'other',
        proficiency: 'intermediate',
        yearsExperience: null,
        isHighlighted: false,
        sortOrder: skillIdx++,
      });
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    conn.close();
  }
});

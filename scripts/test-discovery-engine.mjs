import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import {
  createDatabase,
  educationEntries,
  jobPreferences,
  preferredLocations,
  preferredRoles,
  profiles,
  projects,
  projectTechnologies,
  userSkills,
  users,
} from '../packages/database/dist/index.js';
import { createSession, SESSION_COOKIE_NAME } from '../apps/server/dist/auth/session.js';
import { createDiscoveryRouter } from '../apps/server/dist/routes/discovery.js';
import { evaluateJobAgainstProfile } from '../apps/server/dist/discovery/matcher.js';

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

const internOnlyProfile = {
  userId: 'u1',
  displayName: 'Rudraksh Kumar',
  email: 'test@example.invalid',
  currentTitle: 'Full-Stack Developer',
  headline: 'B.Tech CSE student',
  locationCity: 'Palampur',
  locationCountry: 'India',
  portfolioUrl: 'https://rudraksh-portfolio-sage.vercel.app/',
  githubUrl: 'https://github.com/rudrakshkr',
  linkedinUrl: 'https://linkedin.com/in/rudraksh-kumar2908/',
  skills: [
    { name: 'React', category: 'frontend', isHighlighted: true },
    { name: 'TypeScript', category: 'programming_language', isHighlighted: true },
    { name: 'Node.js', category: 'backend', isHighlighted: true },
    { name: 'PostgreSQL', category: 'database', isHighlighted: false },
  ],
  projects: [
    {
      name: 'PahariKnits',
      tagline: 'Full-Stack E-Commerce Storefront',
      description: 'Apparel storefront with Razorpay checkout',
      projectUrl: 'https://pahariknits.vercel.app',
      repositoryUrl: 'https://github.com/rudrakshkr/pahariknits',
      technologies: ['React', 'Node.js', 'PostgreSQL'],
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
  preferredRoles: [
    { title: 'Full Stack Developer Intern', category: 'full_stack', seniority: 'internship', priority: 0 },
    { title: 'Software Engineering Intern', category: 'software_engineering', seniority: 'internship', priority: 1 },
    { title: 'Frontend Developer Intern', category: 'frontend', seniority: 'internship', priority: 2 },
    { title: 'Backend Developer Intern', category: 'backend', seniority: 'internship', priority: 3 },
  ],
  preferredLocations: [{ city: 'Delhi', region: 'NCR', country: 'India', priority: 0 }],
  preferences: {
    minimumSalary: 15000,
    maximumSalary: null,
    salaryCurrency: 'INR',
    salaryPeriod: 'monthly',
    paidPreference: 'paid_preferred',
    workArrangement: 'remote_preferred',
    willingToRelocate: false,
  },
};

test('strictly enforces internship-only matching when all target roles are internships', () => {
  const realIntern = evaluateJobAgainstProfile(
    {
      sourceName: 'ashby',
      sourceUrl: 'https://jobs.ashbyhq.com/acme/1',
      title: 'Full-Stack Software Engineer Intern',
      companyName: 'Acme India',
      locationText: 'Remote, India',
      salaryText: '₹30,000 / month',
      description: 'Build features with React, TypeScript, Node.js, and PostgreSQL.',
      postedAt: new Date(),
      explicitEmploymentType: 'internship',
    },
    internOnlyProfile,
  );
  assert.equal(realIntern.accepted, true);
  assert.ok(realIntern.matchScore >= 75);
  assert.equal(realIntern.employmentType, 'internship');

  // Regular mid-level Full-stack Developer (NOT an internship!) MUST be rejected
  const normalFullTimeJob = evaluateJobAgainstProfile(
    {
      sourceName: 'arbeitnow',
      sourceUrl: 'https://www.arbeitnow.com/jobs/companies/adomik/full-stack-developer-paris',
      title: 'Full-stack Developer',
      companyName: 'ADOMIK',
      locationText: 'Paris, France',
      description: 'Full-time role building React and Node.js systems.',
    },
    internOnlyProfile,
  );
  assert.equal(normalFullTimeJob.accepted, false);

  // Senior job MUST be rejected
  const seniorJob = evaluateJobAgainstProfile(
    {
      sourceName: 'greenhouse',
      sourceUrl: 'https://boards.greenhouse.io/acme/jobs/2',
      title: 'Senior Full-Stack Engineer',
      companyName: 'Acme Corp',
      locationText: 'San Francisco, USA',
      description: '5+ years experience leading React teams.',
    },
    internOnlyProfile,
  );
  assert.equal(seniorJob.accepted, false);
});

test('extracts only real contacts (zero fake LinkedIn search placeholders) and generates focused drafts', async () => {
  const conn = createDatabase(':memory:');
  applyMigrations(conn.client);

  const u1 = '00000000-0000-4000-8000-000000000011';
  conn.db.insert(users).values({ id: u1, email: 'user1@example.invalid', passwordHash: 'x', displayName: 'Rudraksh Kumar' }).run();
  conn.db.insert(profiles).values({ userId: u1, locationCountry: 'India', githubUrl: 'https://github.com/rudrakshkr' }).run();
  conn.db.insert(preferredRoles).values({ id: 'r1', userId: u1, title: 'Full Stack Developer Intern', category: 'full_stack', seniority: 'internship', priority: 0 }).run();
  conn.db.insert(preferredLocations).values({ id: 'l1', userId: u1, city: 'Delhi', country: 'India', priority: 0 }).run();
  conn.db.insert(jobPreferences).values({ userId: u1, paidPreference: 'paid_preferred', workArrangement: 'remote_preferred' }).run();
  conn.db.insert(userSkills).values({ id: 's1', userId: u1, name: 'React', category: 'frontend' }).run();
  conn.db.insert(educationEntries).values({ id: 'e1', userId: u1, institution: 'Sri Sai University', degree: 'B.Tech', fieldOfStudy: 'Computer Science and Engineering', isCurrent: true }).run();
  conn.db.insert(projects).values({ id: 'p1', userId: u1, name: 'PahariKnits', tagline: 'E-Commerce Storefront' }).run();
  conn.db.insert(projectTechnologies).values({ id: 'pt1', projectId: 'p1', name: 'React' }).run();

  const s1 = createSession(conn.db, u1);
  const app = express();
  app.use(express.json());
  app.use('/api/discovery', createDiscoveryRouter(conn.db));

  const server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/api/discovery`;
    const h1 = { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${s1.token}` };

    const impRes = await fetch(`${base}/jobs/import`, {
      method: 'POST',
      headers: h1,
      body: JSON.stringify({
        title: 'Full Stack Developer Intern',
        companyName: 'Orbit Labs',
        sourceUrl: 'https://orbitlabs.example/careers/intern',
        locationText: 'Remote, India',
        salaryText: '₹25,000 / month',
        description: 'Work with React and Node.js. Email hiring@orbitlabs.example directly.',
      }),
    });
    assert.equal(impRes.status, 201);

    const contactsJson = await (await fetch(`${base}/contacts`, { headers: h1 })).json();
    // ONLY the real email contact should be saved — zero fake LinkedIn keyword search placeholders
    assert.equal(contactsJson.contacts.length, 1);
    assert.equal(contactsJson.contacts[0].email, 'hiring@orbitlabs.example');
    assert.equal(contactsJson.contacts[0].confidence, 'verified');

    const draftsJson = await (await fetch(`${base}/drafts?status=pending_review`, { headers: h1 })).json();
    // Focused: 1 personalized direct email draft to the verified hiring contact (not 3 generic spam drafts)
    assert.equal(draftsJson.drafts.length, 1);
    assert.equal(draftsJson.drafts[0].channel, 'email');
    assert.equal(draftsJson.drafts[0].recipientTarget, 'hiring@orbitlabs.example');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    conn.close();
  }
});

test('rejects Battery, Annuities, US-citizenship-locked, and deduplicates identical roles across URLs', () => {
  const battery = evaluateJobAgainstProfile(
    {
      sourceName: 'simplify_internships',
      sourceUrl: 'https://example.com/1',
      title: 'Battery Engineer Intern - Battery Systems Engineering',
      companyName: 'Meta',
      locationText: 'Sunnyvale, CA',
      explicitEmploymentType: 'internship',
    },
    internOnlyProfile,
  );
  assert.equal(battery.accepted, false);

  const annuities = evaluateJobAgainstProfile(
    {
      sourceName: 'simplify_internships',
      sourceUrl: 'https://example.com/2',
      title: 'SI and Annuities Intern',
      companyName: 'iCapital Network',
      locationText: 'NYC',
      explicitEmploymentType: 'internship',
    },
    internOnlyProfile,
  );
  assert.equal(annuities.accepted, false);

  const usCitizenOnly = evaluateJobAgainstProfile(
    {
      sourceName: 'simplify_internships',
      sourceUrl: 'https://example.com/3',
      title: 'Software Engineer Intern',
      companyName: 'L3Harris Technologies',
      locationText: 'Melbourne, FL',
      sponsorshipNote: 'U.S. Citizenship is Required',
      explicitEmploymentType: 'internship',
    },
    internOnlyProfile,
  );
  assert.equal(usCitizenOnly.accepted, false);

  // Duplicate company + title + location across two different URLs must share one fingerprint
  const dupA = evaluateJobAgainstProfile(
    {
      sourceName: 'simplify_internships',
      sourceUrl: 'https://bandwidth.com/jobs/1001',
      title: 'Software Engineer Intern',
      companyName: 'Bandwidth',
      locationText: 'Remote, India',
      explicitEmploymentType: 'internship',
    },
    internOnlyProfile,
  );
  const dupB = evaluateJobAgainstProfile(
    {
      sourceName: 'simplify_internships',
      sourceUrl: 'https://bandwidth.com/jobs/1002',
      title: 'Software Engineer Intern - Summer 2027',
      companyName: 'Bandwidth Inc.',
      locationText: 'Remote, India',
      explicitEmploymentType: 'internship',
    },
    internOnlyProfile,
  );
  assert.equal(dupA.accepted, true);
  assert.equal(dupA.fingerprint, dupB.fingerprint);
});

test('enforces human approval gate before email sending, builds grounded tailored packs, and classifies targetKind', async () => {
  const conn = createDatabase(':memory:');
  applyMigrations(conn.client);

  const u1 = '00000000-0000-4000-8000-000000000099';
  conn.db.insert(users).values({ id: u1, email: 'gate@example.invalid', passwordHash: 'x', displayName: 'Rudraksh Kumar' }).run();
  conn.db.insert(profiles).values({ userId: u1, locationCountry: 'India', githubUrl: 'https://github.com/rudrakshkr' }).run();
  conn.db.insert(preferredRoles).values({ id: 'r99', userId: u1, title: 'Full Stack Developer Intern', category: 'full_stack', seniority: 'internship', priority: 0 }).run();
  conn.db.insert(userSkills).values({ id: 's99', userId: u1, name: 'TypeScript', category: 'programming_language' }).run();
  conn.db.insert(projects).values({ id: 'p99', userId: u1, name: 'BrandFlight', tagline: 'Brand compliance platform' }).run();
  conn.db.insert(projectTechnologies).values({ id: 'pt99', projectId: 'p99', name: 'TypeScript' }).run();

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

    const impRes = await fetch(`${base}/jobs/import`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: 'Full Stack Developer Intern',
        companyName: 'CloudNine',
        sourceUrl: 'https://cloudnine.example/jobs/intern',
        locationText: 'Remote, India',
        description: 'TypeScript full-stack internship. Contact talent@cloudnine.example.',
      }),
    });
    assert.equal(impRes.status, 201);
    const { jobId } = await impRes.json();

    // Tailored pack is strictly grounded in verified projects & skills
    const tailorRes = await fetch(`${base}/jobs/${jobId}/tailor`, { method: 'POST', headers, body: '{}' });
    assert.equal(tailorRes.status, 200);
    const { pack } = await tailorRes.json();
    assert.ok(pack.coverLetter.includes('BrandFlight'));
    assert.ok(pack.matchedSkills.includes('TypeScript'));

    // Draft targetKind must be 'email' (not misclassified as person_profile or job_posting)
    const draftsRes = await fetch(`${base}/drafts?jobId=${jobId}`, { headers });
    const { drafts } = await draftsRes.json();
    assert.equal(drafts[0].targetKind, 'email');

    // Sending BEFORE approval MUST be blocked with HTTP 400
    const blockedSend = await fetch(`${base}/drafts/${drafts[0].id}/send-email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ recipientEmail: 'talent@cloudnine.example' }),
    });
    assert.equal(blockedSend.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    conn.close();
  }
});

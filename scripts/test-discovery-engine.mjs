import { generateGroundedDraftProposals } from '../apps/server/dist/discovery/people-and-drafts.js';
import { unwrapRedirectUrlSync } from '../apps/server/dist/discovery/connectors.js';
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
import { isValidGithubOrgMatch, sanitizeBioRole, verifyLinkedinSearchHit } from '../apps/server/dist/discovery/people-and-drafts.js';

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

test('rejects false-positive GitHub orgs (APT vs aptos-labs) and unrelated LinkedIn recruiters (BrowserStack vs APT)', () => {
  // APT (apt.trading) MUST NOT match aptos-labs
  assert.equal(
    isValidGithubOrgMatch({
      companyName: 'APT',
      companyDomain: 'apt.trading',
      orgLogin: 'aptos-labs',
      orgName: 'Aptos Labs',
      orgBlog: 'https://aptoslabs.com',
    }),
    false,
  );

  // Short name "APT" with no domain MUST NOT blindly match any org
  assert.equal(
    isValidGithubOrgMatch({
      companyName: 'APT',
      companyDomain: null,
      orgLogin: 'apt',
      orgName: 'APT',
      orgBlog: null,
    }),
    false,
  );

  // Legitimate exact org match SHOULD pass
  assert.equal(
    isValidGithubOrgMatch({
      companyName: 'Razorpay',
      companyDomain: 'razorpay.com',
      orgLogin: 'razorpay',
      orgName: 'Razorpay',
      orgBlog: 'https://razorpay.com',
    }),
    true,
  );

  // Emoji-only GitHub bio ":)" MUST fall back to clean role string
  assert.equal(sanitizeBioRole(':)', 'Engineer at APT'), 'Engineer at APT');

  // Unrelated BrowserStack recruiter in Mumbai MUST be rejected for "APT • Mumbai"
  const browserstackRecruiter = verifyLinkedinSearchHit(
    {
      url: 'https://in.linkedin.com/in/amrin-kably-b226a113b',
      title: 'Amrin Kably - Lead Technical Recruiter - BrowserStack | LinkedIn',
      description: 'Lead Technical Recruiter - Product & Engineering at BrowserStack. Previously in Mumbai.',
    },
    'APT • Mumbai',
    'apt.trading',
  );
  assert.equal(browserstackRecruiter.accepted, false);

  // Real employee explicitly listing APT SHOULD pass
  const realAptEmployee = verifyLinkedinSearchHit(
    {
      url: 'https://in.linkedin.com/in/rohan-mehta-apt',
      title: 'Rohan Mehta - Engineering Manager at APT | LinkedIn',
      description: 'Building algorithmic trading infrastructure at APT (apt.trading) in Mumbai.',
    },
    'APT • Mumbai',
    'apt.trading',
  );
  assert.equal(realAptEmployee.accepted, true);
  assert.equal(realAptEmployee.personName, 'Rohan Mehta');
});

test('international jobs require either WFH-from-India or explicit relocation support', () => {
  // 1. International on-site WITH explicit relocation support -> ACCEPTED
  const intlWithRelocation = evaluateJobAgainstProfile(
    {
      sourceName: 'greenhouse',
      sourceUrl: 'https://boards.greenhouse.io/eurotech/jobs/101',
      title: 'Software Engineer Intern',
      companyName: 'EuroTech',
      locationText: 'Berlin, Germany',
      salaryText: '€2,500 / month',
      description: 'Join our backend team in Berlin. We provide visa sponsorship and a full relocation package for international interns.',
      explicitEmploymentType: 'internship',
    },
    internOnlyProfile,
  );
  assert.equal(intlWithRelocation.accepted, true);
  assert.ok(intlWithRelocation.matchReasons.some((r) => /relocation support/iu.test(r)));

  // 2. International on-site WITHOUT relocation mention -> REJECTED
  const intlNoRelocation = evaluateJobAgainstProfile(
    {
      sourceName: 'greenhouse',
      sourceUrl: 'https://boards.greenhouse.io/uscorp/jobs/102',
      title: 'Software Engineer Intern',
      companyName: 'USCorp',
      locationText: 'San Francisco, CA',
      description: 'Build React and Node.js products in our San Francisco office.',
      explicitEmploymentType: 'internship',
    },
    internOnlyProfile,
  );
  assert.equal(intlNoRelocation.accepted, false);

  // 3. International on-site explicitly saying NO relocation -> REJECTED
  const intlDeniedRelocation = evaluateJobAgainstProfile(
    {
      sourceName: 'ashby',
      sourceUrl: 'https://jobs.ashbyhq.com/localco/103',
      title: 'Full Stack Developer Intern',
      companyName: 'LocalCo',
      locationText: 'London, UK',
      description: 'On-site role in London. Please note that relocation support is not offered for internships.',
      explicitEmploymentType: 'internship',
    },
    internOnlyProfile,
  );
  assert.equal(intlDeniedRelocation.accepted, false);

  // 4. International on-site offering relocation BUT refusing visa sponsorship -> REJECTED
  const intlRelocationNoVisa = evaluateJobAgainstProfile(
    {
      sourceName: 'ashby',
      sourceUrl: 'https://jobs.ashbyhq.com/novisa/104',
      title: 'Software Engineer Intern',
      companyName: 'NoVisaCo',
      locationText: 'Seattle, WA',
      description: 'We offer a relocation bonus for interns. This role does not offer visa sponsorship.',
      explicitEmploymentType: 'internship',
    },
    internOnlyProfile,
  );
  assert.equal(intlRelocationNoVisa.accepted, false);

  // 5. Country-locked foreign remote ("Remote in USA" / "Remote in Canada") -> REJECTED
  const usOnlyRemote = evaluateJobAgainstProfile(
    {
      sourceName: 'remotive',
      sourceUrl: 'https://remotive.com/jobs/105',
      title: 'Frontend Developer Intern',
      companyName: 'USRemoteCo',
      locationText: 'Remote in USA',
      description: 'Work remotely with React and TypeScript. Must reside in the United States.',
      explicitEmploymentType: 'internship',
      explicitWorkArrangement: 'remote',
    },
    internOnlyProfile,
  );
  assert.equal(usOnlyRemote.accepted, false);

  // 6. True global / WFH-supported remote -> ACCEPTED
  const globalRemote = evaluateJobAgainstProfile(
    {
      sourceName: 'remotive',
      sourceUrl: 'https://remotive.com/jobs/106',
      title: 'Full Stack Developer Intern',
      companyName: 'GlobalRemoteCo',
      locationText: 'Remote (Worldwide)',
      salaryText: '$1,500 / month',
      description: 'Work from anywhere with our distributed React and Node.js team.',
      explicitEmploymentType: 'internship',
      explicitWorkArrangement: 'remote',
    },
    internOnlyProfile,
  );
  assert.equal(globalRemote.accepted, true);
  assert.equal(globalRemote.countryScope, 'remote_global');
});

test('unwraps Google redirect links, matches realistic LinkedIn founder snippets, and never puts job URLs in recipientTarget', async () => {
  // 1. Google redirect unwrapping
  const unwrapped = unwrapRedirectUrlSync('https://www.google.com/goto?url=https%3A%2F%2Fwellfound.com%2Fjobs%2F5137293');
  assert.equal(unwrapped, 'https://wellfound.com/jobs/5137293');

  // 2. Realistic LinkedIn format ("Name - Co-Founder - Isomorph AI | LinkedIn" + "Experience: Isomorph AI") -> ACCEPTED
  const founderHit = verifyLinkedinSearchHit(
    {
      url: 'https://in.linkedin.com/in/aarav-shah-isomorph',
      title: 'Aarav Shah - Co-Founder & CTO - Isomorph AI | LinkedIn',
      description: 'Building AI software tools. Experience: Isomorph AI · Education: IIT Delhi · Location: Bengaluru.',
    },
    'Isomorph AI',
    'isomorph.ai',
  );
  assert.equal(founderHit.accepted, true);
  assert.equal(founderHit.contactType, 'founder');

  // 3. Fallback pitch when 0 contacts found MUST set recipientTarget = null (never paste the job link)
  const fallback = await generateGroundedDraftProposals(
    {
      sourceName: 'firecrawl',
      sourceUrl: 'https://wellfound.com/jobs/5137293-software-engineering-intern',
      title: 'Software Engineering Intern',
      companyName: 'Isomorph AI',
    },
    ['TypeScript', 'React'],
    [],
    internOnlyProfile,
    { enabled: false, baseUrl: 'http://127.0.0.1:11434', model: null },
    80,
  );
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].recipientTarget, null);

  // 4. skipFallbackIfNoContacts prevents duplicate pitches when clicking Find Real People
  const skipped = await generateGroundedDraftProposals(
    {
      sourceName: 'firecrawl',
      sourceUrl: 'https://wellfound.com/jobs/5137293-software-engineering-intern',
      title: 'Software Engineering Intern',
      companyName: 'Isomorph AI',
    },
    ['TypeScript'],
    [],
    internOnlyProfile,
    { enabled: false, baseUrl: 'http://127.0.0.1:11434', model: null },
    80,
    { skipFallbackIfNoContacts: true },
  );
  assert.equal(skipped.length, 0);
});

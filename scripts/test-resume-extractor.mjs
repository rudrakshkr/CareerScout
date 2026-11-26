import assert from 'node:assert/strict';
import test from 'node:test';
import { extractResumeFacts } from '../apps/dashboard/src/onboarding/resume-fact-extractor.ts';

const sampleResume = `
Rudraksh Kumar
Full-Stack Software Developer
Palampur, Himachal Pradesh, India | +91 7678669859
[GitHub](https://github.com/rudrakshkr) | [LinkedIn](https://linkedin.com/in/rudraksh-kumar2908/) | [Portfolio](https://rudraksh-portfolio-sage.vercel.app/)

Summary
Full-stack developer building production web applications with React, TypeScript, Node.js, and PostgreSQL.

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

Achievements
1st Place — Inter University TECH Utsav (technical debugging competition)
McKinsey Forward Program Alumni
`;

test('extracts skills strictly from the Skills section with zero prose leakage', () => {
  const facts = extractResumeFacts(sampleResume);
  const skills = facts.filter((f) => f.kind === 'skill').map((f) => f.value);

  assert.ok(skills.includes('JavaScript'));
  assert.ok(skills.includes('TypeScript'));
  assert.ok(skills.includes('React'));
  assert.ok(skills.includes('Node.js'));
  assert.ok(skills.includes('Docker'));
  // Razorpay appeared ONLY in Projects, never in Skills
  assert.ok(!skills.includes('Razorpay'));
  // No prose fragments from project bullets
  assert.ok(!skills.some((s) => /payment verification|linking|returns|refund workflow/i.test(s)));
});

test('splits B.Tech and Computer Science and Engineering cleanly and ignores university awards', () => {
  const facts = extractResumeFacts(sampleResume);
  const education = facts.filter((f) => f.kind === 'education');

  assert.equal(education.length, 1);
  assert.match(education[0].institution ?? '', /Sri Sai University/i);
  assert.equal(education[0].degree, 'B.Tech');
  assert.equal(education[0].fieldOfStudy, 'Computer Science and Engineering');
  assert.equal(education[0].educationLevel, 'bachelor');
  assert.equal(education[0].graduationYear, 2028);
});

test('extracts project URLs, technologies, and profile header metadata cleanly', () => {
  const facts = extractResumeFacts(sampleResume);
  const projects = facts.filter((f) => f.kind === 'project');

  assert.equal(projects.length, 1);
  assert.equal(projects[0].projectName, 'PahariKnits');
  assert.equal(projects[0].projectUrl, 'https://pahariknits.vercel.app/');
  assert.equal(projects[0].repositoryUrl, 'https://github.com/rudrakshkr/pahariknits');
  assert.ok((projects[0].technologies ?? []).includes('Razorpay'));

  const github = facts.find((f) => f.kind === 'githubUrl');
  const portfolio = facts.find((f) => f.kind === 'portfolioUrl');
  const city = facts.find((f) => f.kind === 'locationCity');
  const country = facts.find((f) => f.kind === 'locationCountry');

  assert.equal(github?.value, 'https://github.com/rudrakshkr');
  assert.equal(portfolio?.value, 'https://rudraksh-portfolio-sage.vercel.app/');
  assert.equal(city?.value, 'Palampur');
  assert.equal(country?.value, 'India');
});

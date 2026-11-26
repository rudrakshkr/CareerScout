import { ollamaChatText } from '../ai/ollama.js';
import { firecrawlWebSearch } from './connectors.js';
import type { RawDiscoveredJob, UserProfileContext } from './types.js';

export interface DiscoveredContactCandidate {
  fullName: string;
  roleTitle: string | null;
  contactType: 'recruiter' | 'hiring_manager' | 'engineer_referral' | 'founder' | 'talent_team' | 'other';
  email: string | null;
  profileUrl: string | null;
  platform: 'email' | 'linkedin' | 'github' | 'x' | 'company_site' | 'other';
  sourceUrl: string;
  sourceNote: string;
  confidence: 'verified' | 'likely' | 'search_lead';
}

export interface GeneratedDraftProposal {
  channel: 'email' | 'linkedin_dm' | 'linkedin_note' | 'referral_request' | 'cover_letter' | 'other';
  recipientLabel: string;
  recipientTarget: string | null;
  subject: string | null;
  body: string;
  groundingFacts: string[];
  contactIndex: number | null;
}

export interface TailoredApplicationPack {
  jobTitle: string;
  companyName: string;
  tailoredHeadline: string;
  tailoredSummary: string;
  matchedSkills: string[];
  highlightedProjects: Array<{ name: string; pitch: string; url: string | null }>;
  coverLetter: string;
  markdownExport: string;
  generatedWithAi: boolean;
}

const PUBLIC_EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu;
const IGNORED_EMAIL_PREFIX = /^(?:noreply|no-reply|donotreply|privacy|legal|support|abuse|security|press|media|dmca|billing|accessibility|info@example|example@)/iu;

export function extractPublicEmails(text: string): string[] {
  const matches = text.match(PUBLIC_EMAIL_REGEX) ?? [];
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const raw of matches) {
    const email = raw.trim().toLowerCase();
    if (IGNORED_EMAIL_PREFIX.test(email) || seen.has(email)) continue;
    if (/\.(?:png|jpg|jpeg|svg|gif|webp|css|js)$/iu.test(email)) continue;
    seen.add(email);
    valid.push(email);
  }
  return valid;
}

async function resolveGithubOrgPeople(
  companyName: string,
  githubToken: string | null,
): Promise<DiscoveredContactCandidate[]> {
  const cleanName = companyName.replace(/\b(?:inc\.?|ltd\.?|llc|corp\.?|technologies|labs?|software|private|limited)\b/giu, '').trim();
  const guessedSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/gu, '');
  if (guessedSlug.length < 2) return [];

  const ghHeaders: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'CareerScout-Local/0.4',
  };
  if (githubToken?.trim()) {
    ghHeaders.Authorization = `Bearer ${githubToken.trim()}`;
  }

  const ghFetch = async <T>(url: string): Promise<T | null> => {
    try {
      const res = await fetch(url, { headers: ghHeaders, signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  };

  // 1. Resolve actual GitHub organization login (try exact slug first, then search)
  let orgLogin: string | null = null;
  const directOrg = await ghFetch<{ login?: string; type?: string }>(`https://api.github.com/orgs/${encodeURIComponent(guessedSlug)}`);
  if (directOrg?.login) {
    orgLogin = directOrg.login;
  } else {
    const searchRes = await ghFetch<{ items?: Array<{ login?: string }> }>(
      `https://api.github.com/search/users?q=${encodeURIComponent(`${cleanName} type:org`)}&per_page=2`,
    );
    const candidateLogin = searchRes?.items?.[0]?.login;
    if (candidateLogin && candidateLogin.toLowerCase().includes(guessedSlug.slice(0, Math.min(4, guessedSlug.length)))) {
      orgLogin = candidateLogin;
    }
  }
  if (!orgLogin) return [];

  // 2. Collect candidate usernames from public members OR active top repo contributors
  const logins: string[] = [];
  const members = await ghFetch<Array<{ login?: string }>>(
    `https://api.github.com/orgs/${encodeURIComponent(orgLogin)}/public_members?per_page=5`,
  );
  for (const m of members ?? []) {
    if (m.login && !logins.includes(m.login)) logins.push(m.login);
  }

  if (logins.length === 0) {
    const repos = await ghFetch<Array<{ name?: string; fork?: boolean }>>(
      `https://api.github.com/orgs/${encodeURIComponent(orgLogin)}/repos?sort=updated&per_page=3`,
    );
    const mainRepo = (repos ?? []).find((r) => r.name && !r.fork);
    if (mainRepo?.name) {
      const contributors = await ghFetch<Array<{ login?: string; type?: string }>>(
        `https://api.github.com/repos/${encodeURIComponent(orgLogin)}/${encodeURIComponent(mainRepo.name)}/contributors?per_page=5`,
      );
      for (const c of contributors ?? []) {
        if (c.login && c.type === 'User' && !/bot$/iu.test(c.login) && !logins.includes(c.login)) {
          logins.push(c.login);
        }
      }
    }
  }

  // 3. Resolve each engineer's real GitHub profile (real name, bio, public email, blog/LinkedIn)
  const resolved: DiscoveredContactCandidate[] = [];
  for (const login of logins.slice(0, 3)) {
    const user = await ghFetch<{
      name?: string | null;
      bio?: string | null;
      email?: string | null;
      blog?: string | null;
      company?: string | null;
      twitter_username?: string | null;
      html_url?: string;
    }>(`https://api.github.com/users/${encodeURIComponent(login)}`);
    if (!user) continue;

    const realName = user.name?.trim();
    const email = user.email?.trim() || null;
    if (!realName && !email) continue;

    const bioRole = user.bio?.replace(/\s+/gu, ' ').trim().slice(0, 95) || `Engineer at ${companyName} (@${login})`;
    const isManager = /\b(?:manager|lead|cto|vp|head\s+of|founder|director|staff|principal)\b/iu.test(bioRole);
    const blogRaw = user.blog?.trim() || '';
    const blogUrl = blogRaw ? (/^https?:\/\//iu.test(blogRaw) ? blogRaw : `https://${blogRaw}`) : null;
    const isLinkedInBlog = Boolean(blogUrl && /linkedin\.com\/in\//iu.test(blogUrl));

    resolved.push({
      fullName: realName || login,
      roleTitle: bioRole,
      contactType: isManager ? 'hiring_manager' : 'engineer_referral',
      email,
      profileUrl: isLinkedInBlog ? blogUrl : (user.html_url || `https://github.com/${login}`),
      platform: email ? 'email' : isLinkedInBlog ? 'linkedin' : 'github',
      sourceUrl: `https://github.com/orgs/${orgLogin}/people`,
      sourceNote: [
        `Public engineer associated with @${orgLogin} on GitHub (${user.html_url || `https://github.com/${login}`}).`,
        blogUrl && !isLinkedInBlog ? `Website: ${blogUrl}` : null,
        user.twitter_username ? `X: https://x.com/${user.twitter_username}` : null,
      ].filter(Boolean).join(' '),
      confidence: email ? 'verified' : 'likely',
    });
  }
  return resolved;
}

async function scanCompanySiteForRealEmails(companyName: string, siteUrl: string | null | undefined): Promise<DiscoveredContactCandidate[]> {
  if (!siteUrl) return [];
  try {
    const parsed = new URL(siteUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return [];
    if (/(?:greenhouse\.io|lever\.co|ashbyhq\.com|remotive\.com|remotefirstjobs\.com|arbeitnow\.com|jobicy\.com|ycombinator\.com|linkedin\.com|github\.com)$/iu.test(parsed.hostname)) {
      return [];
    }

    const foundEmails = new Set<string>();
    const pagesToTry = [parsed.href, `${parsed.origin}/careers`, `${parsed.origin}/about`];

    for (const url of pagesToTry.slice(0, 2)) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'CareerScout-Local/0.4' },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) continue;
        const html = (await res.text()).slice(0, 120_000);
        for (const email of extractPublicEmails(html)) {
          if (/(?:career|job|recruit|talent|hr|hiring|people|founder|team|hello|contact)/iu.test(email)) {
            foundEmails.add(email);
          }
        }
        if (foundEmails.size >= 2) break;
      } catch {
        // Ignore unreachable subpage
      }
    }

    return [...foundEmails].slice(0, 2).map((email) => ({
      fullName: `${companyName} Recruiting`,
      roleTitle: /(?:career|job|recruit|talent|hr|hiring)/iu.test(email) ? 'Recruiting / Careers Inbox' : 'Company Team Contact',
      contactType: /(?:career|job|recruit|talent|hr|hiring)/iu.test(email) ? 'recruiter' : 'talent_team',
      email,
      profileUrl: parsed.href,
      platform: 'email',
      sourceUrl: parsed.href,
      sourceNote: `Public email published on ${parsed.hostname}.`,
      confidence: 'verified',
    }));
  } catch {
    return [];
  }
}

async function discoverNamedPeopleViaFirecrawl(options: {
  apiKey: string;
  companyName: string;
  roleTitle: string;
}): Promise<{ contacts: DiscoveredContactCandidate[]; creditsUsed: number }> {
  const query = `site:linkedin.com/in "${options.companyName}" ("Engineering Manager" OR "Technical Recruiter" OR "Talent Acquisition" OR "Software Engineer" OR "Frontend" OR "Full Stack")`;
  const res = await firecrawlWebSearch({
    apiKey: options.apiKey,
    query,
    limit: 5,
  });

  const contacts: DiscoveredContactCandidate[] = [];
  for (const hit of res.hits) {
    if (!/linkedin\.com\/in\/[^/?#]+/iu.test(hit.url)) continue;
    const cleanUrl = hit.url.replace(/[?#].*$/u, '');
    const cleanedTitle = hit.title.replace(/\s*\|\s*LinkedIn.*$/iu, '').trim();
    const parts = cleanedTitle.split(/\s+-\s+|\s+–\s+|\s+\|\s+/u).map((p) => p.trim()).filter(Boolean);
    const personName = parts[0];
    const personRole = parts.slice(1).join(' · ') || `Team Member at ${options.companyName}`;
    if (!personName || personName.length < 3 || personName.length > 60) continue;

    const isRecruiter = /\b(?:recruiter|talent|hr|people)\b/iu.test(personRole);
    const isManager = /\b(?:manager|lead|head|director|vp|cto|founder)\b/iu.test(personRole);

    contacts.push({
      fullName: personName,
      roleTitle: personRole.slice(0, 130),
      contactType: isRecruiter ? 'recruiter' : isManager ? 'hiring_manager' : 'engineer_referral',
      email: null,
      profileUrl: cleanUrl,
      platform: 'linkedin',
      sourceUrl: cleanUrl,
      sourceNote: `Direct public LinkedIn profile found via Firecrawl v2 for ${options.companyName} (${options.roleTitle}).`,
      confidence: 'likely',
    });
  }

  return { contacts: contacts.slice(0, 3), creditsUsed: 1 };
}

export async function discoverCompanyContacts(
  job: RawDiscoveredJob,
  options: {
    deepLookup: boolean;
    firecrawlApiKey?: string | null;
    githubToken?: string | null;
  },
): Promise<{ contacts: DiscoveredContactCandidate[]; firecrawlCreditsUsed: number }> {
  const contacts: DiscoveredContactCandidate[] = [];
  const company = job.companyName.trim();
  let firecrawlCreditsUsed = 0;

  // 1. Direct contact hint (e.g. HN Who is Hiring poster)
  if (job.rawContactHint?.email || job.rawContactHint?.name) {
    const email = job.rawContactHint.email?.trim() || null;
    contacts.push({
      fullName: job.rawContactHint.name?.trim() || `Hiring Team at ${company}`,
      roleTitle: job.rawContactHint.roleTitle?.trim() || 'Hiring Contact',
      contactType: 'hiring_manager',
      email,
      profileUrl: job.rawContactHint.profileUrl ?? job.sourceUrl,
      platform: email ? 'email' : 'other',
      sourceUrl: job.sourceUrl,
      sourceNote: job.rawContactHint.note || `Extracted directly from public job listing at ${job.sourceUrl}.`,
      confidence: email ? 'verified' : 'likely',
    });
  }

  // 2. Public emails explicitly written inside the job description
  for (const email of extractPublicEmails(job.description ?? '').slice(0, 2)) {
    if (contacts.some((c) => c.email?.toLowerCase() === email)) continue;
    const isTalent = /(?:career|job|recruit|talent|hr|hiring|people)/iu.test(email);
    contacts.push({
      fullName: isTalent ? `${company} Recruiting Team` : `${company} Hiring Contact`,
      roleTitle: isTalent ? 'Talent Acquisition / Recruiting' : 'Hiring Contact (Job Post)',
      contactType: isTalent ? 'recruiter' : 'hiring_manager',
      email,
      profileUrl: job.sourceUrl,
      platform: 'email',
      sourceUrl: job.sourceUrl,
      sourceNote: `Email address explicitly published in the job description at ${job.sourceUrl}.`,
      confidence: 'verified',
    });
  }

  // 3. Deep lookup: real GitHub org/repo engineers + public company website emails + Firecrawl v2 named LinkedIn people
  if (options.deepLookup) {
    const [ghPeople, siteEmails] = await Promise.all([
      resolveGithubOrgPeople(company, options.githubToken ?? null),
      scanCompanySiteForRealEmails(company, job.companyWebsite),
    ]);

    for (const item of [...siteEmails, ...ghPeople]) {
      const dup = contacts.some(
        (c) =>
          (item.email && c.email?.toLowerCase() === item.email.toLowerCase())
          || (item.profileUrl && c.profileUrl === item.profileUrl),
      );
      if (!dup) contacts.push(item);
    }

    if (options.firecrawlApiKey?.trim() && contacts.length < 2) {
      const fc = await discoverNamedPeopleViaFirecrawl({
        apiKey: options.firecrawlApiKey.trim(),
        companyName: company,
        roleTitle: job.title,
      });
      firecrawlCreditsUsed += fc.creditsUsed;
      for (const person of fc.contacts) {
        if (!contacts.some((c) => c.profileUrl === person.profileUrl)) {
          contacts.push(person);
        }
      }
    }
  }

  return { contacts, firecrawlCreditsUsed };
}

function firstNameOf(fullName: string): string {
  const cleaned = fullName.replace(/\(.*?\)/gu, '').trim();
  if (/hiring|team|recruiting|contact/iu.test(cleaned)) return cleaned;
  return cleaned.split(/\s+/u)[0] || cleaned;
}

function selectProfileHighlights(profile: UserProfileContext, matchedSkills: string[]) {
  const topSkills = (matchedSkills.length > 0 ? matchedSkills : profile.skills.map((s) => s.name)).slice(0, 6);
  const topProjects = profile.projects
    .map((p) => {
      const overlap = p.technologies.filter((t) =>
        topSkills.some((s) => s.toLowerCase() === t.toLowerCase()),
      ).length;
      return { project: p, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 2)
    .map((x) => x.project);

  const primaryEducation = profile.education[0] ?? null;
  const groundingFacts: string[] = [];
  if (primaryEducation) {
    groundingFacts.push(
      `Education: ${[primaryEducation.degree, primaryEducation.fieldOfStudy, primaryEducation.institution].filter(Boolean).join(' · ')}`,
    );
  }
  if (topSkills.length > 0) groundingFacts.push(`Verified skills: ${topSkills.join(', ')}`);
  for (const proj of topProjects) {
    groundingFacts.push(`Project: ${proj.name}${proj.projectUrl ? ` (${proj.projectUrl})` : proj.repositoryUrl ? ` (${proj.repositoryUrl})` : ''}`);
  }
  if (profile.githubUrl) groundingFacts.push(`GitHub: ${profile.githubUrl}`);
  if (profile.portfolioUrl) groundingFacts.push(`Portfolio: ${profile.portfolioUrl}`);

  return { topSkills, topProjects, primaryEducation, groundingFacts };
}

export async function generateGroundedDraftProposals(
  job: RawDiscoveredJob,
  matchedSkills: string[],
  contacts: DiscoveredContactCandidate[],
  profile: UserProfileContext,
  ollama: { enabled: boolean; baseUrl: string; model: string | null },
  matchScore = 70,
): Promise<GeneratedDraftProposal[]> {
  const company = job.companyName.trim();
  const role = job.title.trim();
  const { topSkills, topProjects, primaryEducation, groundingFacts } = selectProfileHighlights(profile, matchedSkills);

  const eduSentence = primaryEducation
    ? `I am currently pursuing ${[primaryEducation.degree, primaryEducation.fieldOfStudy].filter(Boolean).join(' in ')} at ${primaryEducation.institution}`
    : `I am a ${profile.currentTitle || 'software developer'}`;

  const projectSentence = topProjects.length > 0
    ? `Recently I shipped ${topProjects.map((p) => `${p.name}${p.tagline ? ` (${p.tagline})` : ''}`).join(' and ')}${topProjects[0].technologies.length ? ` using ${topProjects[0].technologies.slice(0, 4).join(', ')}` : ''}.`
    : '';

  const linksLine = [
    profile.portfolioUrl ? `Portfolio: ${profile.portfolioUrl}` : null,
    profile.githubUrl ? `GitHub: ${profile.githubUrl}` : null,
    profile.linkedinUrl ? `LinkedIn: ${profile.linkedinUrl}` : null,
  ].filter(Boolean).join(' | ');

  const proposals: GeneratedDraftProposal[] = [];

  // 1. Focused personalized drafts for up to 2 REAL discovered contacts
  const prioritized = contacts
    .map((c, index) => ({ contact: c, index }))
    .sort((a, b) => {
      const rank = (c: DiscoveredContactCandidate) => (c.email ? 3 : c.platform === 'linkedin' ? 2 : 1);
      return rank(b.contact) - rank(a.contact);
    })
    .slice(0, 2);

  for (const { contact, index } of prioritized) {
    const greetingName = firstNameOf(contact.fullName);
    const isReferral = contact.contactType === 'engineer_referral';

    const rawBody = isReferral
      ? [
          `Hi ${greetingName},`,
          '',
          `I came across your profile${contact.roleTitle ? ` (${contact.roleTitle})` : ''} while researching the ${role} opening at ${company}.`,
          '',
          `${eduSentence}${topSkills.length ? `, working with ${topSkills.slice(0, 5).join(', ')}` : ''}. ${projectSentence}`.trim(),
          '',
          `If my background looks like a fit for the team, would you be open to sharing a quick referral or pointing me toward the hiring manager for the ${role} role?`,
          linksLine ? `\n${linksLine}` : '',
          '',
          `Thanks for your time,`,
          profile.displayName,
        ].filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n')
      : [
          `Hi ${greetingName},`,
          '',
          `I saw the ${role} opening at ${company} (${job.sourceUrl}) and wanted to reach out directly.`,
          '',
          `${eduSentence}${topSkills.length ? `, building projects with ${topSkills.slice(0, 5).join(', ')}` : ''}. ${projectSentence}`.trim(),
          '',
          `I would love to be considered for the ${role} position and am happy to share my resume or walk through my code.`,
          linksLine ? `\n${linksLine}` : '',
          '',
          `Best regards,`,
          profile.displayName,
        ].filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n');

    let finalBody = rawBody;
    if (ollama.enabled) {
      const polished = await ollamaChatText({
        baseUrl: ollama.baseUrl,
        model: ollama.model,
        system: 'You are a concise career writing assistant. Rewrite outreach messages to sound natural, direct, and under 135 words. NEVER invent any skill, metric, employer, degree, or link not listed in the verified facts.',
        user: `Verified facts:\n${groundingFacts.join('\n')}\n\nRecipient: ${contact.fullName} (${contact.roleTitle ?? company})\nRole: ${role} at ${company}\n\nDraft:\n${rawBody}`,
      });
      if (polished) finalBody = polished;
    }

    proposals.push({
      channel: contact.email ? 'email' : isReferral ? 'referral_request' : 'linkedin_dm',
      recipientLabel: `${contact.fullName}${contact.roleTitle ? ` — ${contact.roleTitle}` : ''}`,
      recipientTarget: contact.email ?? contact.profileUrl ?? null,
      subject: isReferral
        ? `Referral inquiry: ${role} at ${company} — ${profile.displayName}`
        : `Application: ${role} — ${profile.displayName}`,
      body: finalBody,
      groundingFacts,
      contactIndex: index,
    });
  }

  // 2. If NO real contact was found yet, create 1 clear Application Pitch / Cover Letter (explicitly linked to the job posting, never pretending to be a person's profile)
  if (proposals.length === 0 && matchScore >= 55) {
    const pitchBody = [
      `Hi ${company} Hiring Team,`,
      '',
      `I am applying for the ${role} position at ${company}. ${eduSentence}${topSkills.length ? `, with practical experience in ${topSkills.slice(0, 5).join(', ')}` : ''}. ${projectSentence}`.trim(),
      '',
      `I am excited about contributing to ${company}'s engineering team and can start quickly. Thank you for considering my application!`,
      linksLine ? `\n${linksLine}` : '',
      '',
      `Best regards,`,
      profile.displayName,
    ].filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n');

    proposals.push({
      channel: 'cover_letter',
      recipientLabel: `${company} Application Pitch (no verified person found yet)`,
      recipientTarget: job.applyUrl ?? job.sourceUrl,
      subject: `Application: ${role} — ${profile.displayName}`,
      body: pitchBody,
      groundingFacts,
      contactIndex: null,
    });
  }

  return proposals;
}

export async function buildTailoredApplicationPack(
  job: { title: string; companyName: string; description: string | null; sourceUrl: string },
  matchedSkills: string[],
  profile: UserProfileContext,
  ollama: { enabled: boolean; baseUrl: string; model: string | null },
): Promise<TailoredApplicationPack> {
  const { topSkills, topProjects, primaryEducation, groundingFacts } = selectProfileHighlights(profile, matchedSkills);

  const tailoredHeadline = `${profile.currentTitle || 'Software Developer'} · ${topSkills.slice(0, 4).join(' · ') || 'Full-Stack Web Development'}`;
  const baseSummary = [
    primaryEducation
      ? `${[primaryEducation.degree, primaryEducation.fieldOfStudy].filter(Boolean).join(' in ')} student at ${primaryEducation.institution}`
      : `${profile.currentTitle || 'Software developer'}`,
    topSkills.length ? `focused on ${topSkills.join(', ')}` : 'focused on full-stack web engineering',
    `tailored for ${job.title} at ${job.companyName}.`,
    topProjects.length ? `Shipped ${topProjects.map((p) => p.name).join(' and ')}.` : '',
  ].filter(Boolean).join(' ');

  const baseCoverLetter = [
    `Dear ${job.companyName} Hiring Team,`,
    '',
    `I am writing to express my strong interest in the ${job.title} role at ${job.companyName}. ${baseSummary}`,
    '',
    ...topProjects.map(
      (p) => `- ${p.name}${p.tagline ? ` — ${p.tagline}` : ''}: ${p.description?.slice(0, 260) || `Built with ${p.technologies.join(', ')}.`}${p.projectUrl ? ` (${p.projectUrl})` : p.repositoryUrl ? ` (${p.repositoryUrl})` : ''}`,
    ),
    '',
    `Thank you for your time and consideration. I would welcome the opportunity to discuss how I can contribute to ${job.companyName}.`,
    '',
    `Sincerely,`,
    profile.displayName,
    [profile.email, profile.portfolioUrl, profile.githubUrl, profile.linkedinUrl].filter(Boolean).join(' | '),
  ].join('\n');

  let finalCoverLetter = baseCoverLetter;
  let generatedWithAi = false;
  if (ollama.enabled) {
    const polished = await ollamaChatText({
      baseUrl: ollama.baseUrl,
      model: ollama.model,
      system: 'Write a crisp, factual cover letter under 220 words tailored to the target role. ONLY use verified facts provided by the user—never fabricate employers, skills, or numbers.',
      user: `Target role: ${job.title} at ${job.companyName}\nVerified facts:\n${groundingFacts.join('\n')}\n\nBase letter:\n${baseCoverLetter}`,
      timeoutMs: 30_000,
    });
    if (polished) {
      finalCoverLetter = polished;
      generatedWithAi = true;
    }
  }

  const highlightedProjects = topProjects.map((p) => ({
    name: p.name,
    pitch: p.description?.slice(0, 260) || p.tagline || `Built with ${p.technologies.join(', ')}`,
    url: p.projectUrl || p.repositoryUrl || null,
  }));

  const markdownExport = [
    `# Tailored Application Pack — ${job.title} at ${job.companyName}`,
    `Source: ${job.sourceUrl}`,
    '',
    `## Tailored Resume Headline`,
    tailoredHeadline,
    '',
    `## Tailored Summary`,
    baseSummary,
    '',
    `## Verified Skills to Emphasize`,
    topSkills.join(', ') || 'See profile',
    '',
    `## Highlighted Projects`,
    ...highlightedProjects.map((p) => `- **${p.name}**: ${p.pitch}${p.url ? ` (${p.url})` : ''}`),
    '',
    `## Cover Letter`,
    finalCoverLetter,
  ].join('\n');

  return {
    jobTitle: job.title,
    companyName: job.companyName,
    tailoredHeadline,
    tailoredSummary: baseSummary,
    matchedSkills: topSkills,
    highlightedProjects,
    coverLetter: finalCoverLetter,
    markdownExport,
    generatedWithAi,
  };
}

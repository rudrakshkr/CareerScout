import { ollamaChatText } from '../ai/ollama.js';
import { verifyCurrentEmployeeWithAi, type OllamaRuntimeOptions } from '../ai/verifiers.js';
import { firecrawlWebSearch, resolveRedirectUrl, type FirecrawlSearchHit } from './connectors.js';
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

export interface ContactDiscoveryDiagnostics {
  resolvedDomain: string | null;
  linkedinHitsReturned: number;
  linkedinRejected: number;
  founderWebHits: number;
  siteEmailsFound: number;
  githubMembersFound: number;
  firecrawlError: string | null;
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

const PUBLIC_EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu;
const IGNORED_EMAIL_PREFIX = /^(?:noreply|no-reply|donotreply|privacy|legal|support|abuse|security|press|media|dmca|billing|accessibility|info@example|example@|sentry@|notifications@)/iu;
const GENERIC_JOB_HOSTS = /(?:greenhouse\.io|lever\.co|ashbyhq\.com|remotive\.com|remotefirstjobs\.com|arbeitnow\.com|jobicy\.com|ycombinator\.com|linkedin\.com|wellfound\.com|internshala\.com|cutshort\.io|github\.com|forms\.gle|docs\.google\.com|google\.com|wikipedia\.org|crunchbase\.com|glassdoor\.com|indeed\.com|ambitionbox\.com|tracxn\.com|pitchbook\.com|zoominfo\.com|rocketreach\.co|apollo\.io|lusha\.com|signalhire\.com|facebook\.com|instagram\.com|youtube\.com)$/iu;

export function cleanCompanyNameForLookup(raw: string): string {
  return raw
    .split(/[•·|]/u)[0]
    .replace(/\b(?:inc\.?|ltd\.?|llc|corp\.?|corporation|pvt\.?|private|limited|technologies|technology|software)\b/giu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function extractDomainHost(urlLike: string | null | undefined): string | null {
  if (!urlLike) return null;
  const trimmed = urlLike.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(/^https?:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./u, '');
    if (!host || GENERIC_JOB_HOSTS.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

export function sanitizeBioRole(bio: string | null | undefined, fallback: string): string {
  const cleaned = (bio ?? '').replace(/\s+/gu, ' ').trim();
  const alphaCount = (cleaned.match(/[a-zA-Z]/gu) ?? []).length;
  if (alphaCount < 6) return fallback;
  return cleaned.slice(0, 95);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function indicatesFormerEmployeeAtCompany(text: string, companyName: string): boolean {
  const cleanCompany = cleanCompanyNameForLookup(companyName);
  if (cleanCompany.length < 2) return false;
  const escaped = escapeRegExp(cleanCompany);

  const formerBeforeCompany = new RegExp(
    `\\b(?:ex[\\s-]*|former(?:ly)?(?:\\s+\\w+){0,4}\\s+(?:at|@|of|with)?\\s*|previously(?:\\s+\\w+){0,4}\\s+(?:at|@|with)?\\s*|past(?:\\s+experience)?:?\\s*(?:[^.|;\\n]{0,30})?|worked\\s+at\\s+|alumni\\s+(?:of|at)\\s+)${escaped}(?:$|[^a-z0-9])`,
    'iu',
  );
  if (formerBeforeCompany.test(text)) return true;

  const companyThenFormer = new RegExp(
    `(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])\\s*(?:alumni|alumnus|alumna|former\\s+employee)`,
    'iu',
  );
  if (companyThenFormer.test(text)) return true;

  const endedRangeNearCompany = new RegExp(
    `(?:^|[^a-z0-9])${escaped}[^.\\n]{0,45}\\b(?:19|20)\\d{2}\\s*(?:-|–|—|to)\\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\s+)?(20\\d{2})\\b`,
    'iu',
  );
  const endedMatch = text.match(endedRangeNearCompany);
  if (endedMatch && !new RegExp(`(?:^|[^a-z0-9])${escaped}[^.\\n]{0,55}\\b(?:present|current(?:ly)?|now)\\b`, 'iu').test(text)) {
    const endYear = Number(endedMatch[1]);
    const currentYear = new Date().getFullYear();
    if (Number.isFinite(endYear) && endYear <= currentYear) {
      return true;
    }
  }

  return false;
}

export function isValidGithubOrgMatch(options: {
  companyName: string;
  companyDomain: string | null;
  orgLogin: string;
  orgName: string | null;
  orgBlog: string | null;
}): boolean {
  const cleanCompany = cleanCompanyNameForLookup(options.companyName);
  const companySlug = cleanCompany.toLowerCase().replace(/[^a-z0-9]/gu, '');
  const orgSlug = options.orgLogin.toLowerCase().replace(/[^a-z0-9]/gu, '');
  const orgDisplaySlug = cleanCompanyNameForLookup(options.orgName ?? '').toLowerCase().replace(/[^a-z0-9]/gu, '');
  const orgDomain = extractDomainHost(options.orgBlog);

  if (companySlug.length < 2) return false;

  if (options.companyDomain && orgDomain) {
    if (orgDomain === options.companyDomain || orgDomain.endsWith(`.${options.companyDomain}`)) {
      return true;
    }
    return false;
  }

  if (companySlug.length <= 4) return false;
  return orgSlug === companySlug || (orgDisplaySlug.length >= 5 && orgDisplaySlug === companySlug);
}

export function verifyLinkedinSearchHit(
  hit: FirecrawlSearchHit,
  companyName: string,
  companyDomain: string | null,
): {
  accepted: boolean;
  personName: string;
  personRole: string;
  evidenceSnippet: string;
  contactType: DiscoveredContactCandidate['contactType'];
} {
  const reject = {
    accepted: false,
    personName: '',
    personRole: '',
    evidenceSnippet: '',
    contactType: 'other' as const,
  };

  if (!/linkedin\.com\/in\/[^/?#]+/iu.test(hit.url)) return reject;

  const cleanCompany = cleanCompanyNameForLookup(companyName);
  if (cleanCompany.length < 2) return reject;

  const cleanedTitle = hit.title.replace(/\s*\|\s*LinkedIn.*$/iu, '').trim();
  const titleParts = cleanedTitle.split(/\s+-\s+|\s+–\s+|\s+\|\s+/u).map((p) => p.trim()).filter(Boolean);
  const personName = titleParts[0] || '';
  const headlineParts = titleParts.slice(1);
  const personRole = headlineParts.join(' · ');

  if (!personName || personName.length < 3 || personName.length > 60) return reject;
  if (/\b(?:profiles?|jobs?|hiring|top\s+\d+|linkedin)\b/iu.test(personName)) return reject;

  const snippet = (hit.description || hit.markdown || '').replace(/\s+/gu, ' ').trim();
  const fullContext = `${cleanedTitle}\n${snippet}`;

  // HARD REJECT any ex-employee / former employee / ended tenure at the target company
  if (indicatesFormerEmployeeAtCompany(fullContext, cleanCompany)) {
    return reject;
  }

  const companyEscaped = escapeRegExp(cleanCompany);
  const wholeWordCompany = new RegExp(`(?:^|[^a-z0-9])${companyEscaped}(?:$|[^a-z0-9])`, 'iu');

  // LinkedIn standard snippet: "Experience: <Current Company> · Education: ..."
  const experienceHeaderMatch = snippet.match(/\bExperience:\s*([^·|.\n]{2,65})/iu);
  const experienceCurrentCompany = experienceHeaderMatch?.[1]?.trim() ?? '';
  const experienceMatchesTarget = Boolean(experienceCurrentCompany && wholeWordCompany.test(experienceCurrentCompany));

  // If LinkedIn explicitly lists a DIFFERENT current employer in "Experience: <OtherCo>" -> reject
  if (experienceCurrentCompany && !experienceMatchesTarget && !wholeWordCompany.test(personRole)) {
    return reject;
  }

  // If headline explicitly states "at <OtherCompany>" -> reject
  const explicitAtMatch = personRole.match(/\b(?:at|@)\s+([A-Za-z0-9][A-Za-z0-9.&' -]{1,40})/iu);
  if (explicitAtMatch?.[1] && !wholeWordCompany.test(explicitAtMatch[1]) && !experienceMatchesTarget) {
    return reject;
  }

  // If title follows "Name - Role - OtherCompany" without matching target -> reject
  if (headlineParts.length >= 2 && !experienceMatchesTarget) {
    const trailingEmployer = headlineParts[headlineParts.length - 1];
    const looksLikeRoleOrTagline = /\b(?:engineer|developer|manager|recruiter|lead|founder|cto|ceo|talent|product|software|full[\s-]?stack|front[\s-]?end|back[\s-]?end|hiring|saas|ai|b2b|building|scaling|helping)\b/iu.test(trailingEmployer);
    if (!looksLikeRoleOrTagline && !wholeWordCompany.test(trailingEmployer) && !wholeWordCompany.test(personRole)) {
      return reject;
    }
  }

  const domainMatched = Boolean(companyDomain && new RegExp(escapeRegExp(companyDomain), 'iu').test(fullContext));
  const titleMentionsCompany = headlineParts.some((part) => wholeWordCompany.test(part));
  const currentEmploymentPattern = new RegExp(
    `(?:(?:\\bat\\b|@|current(?:ly)?:?|experience:|building|founder\\s+of|co-?founder\\s+of)\\s*[^.;|\\n]{0,35}(?:^|[^a-z0-9])${companyEscaped}(?:$|[^a-z0-9])|(?:^|[^a-z0-9])${companyEscaped}(?:$|[^a-z0-9])\\s*(?:·|\\||-|–|,)\\s*(?:present|current|full[- ]time|engineer|recruiter|founder|manager|lead|developer|cto|ceo))`,
    'iu',
  );
  const snippetShowsCurrentEmployment = experienceMatchesTarget || currentEmploymentPattern.test(snippet);

  const isShortAmbiguousName = cleanCompany.replace(/[^a-z0-9]/gu, '').length <= 4;
  if (isShortAmbiguousName) {
    const strictTitleEmployer =
      new RegExp(`(?:\\bat\\b|@|^)\\s*${companyEscaped}\\s*$`, 'iu').test(headlineParts[headlineParts.length - 1] ?? '')
      || new RegExp(`(?:\\bat\\b|@)\\s*${companyEscaped}(?:$|[^a-z0-9])`, 'iu').test(personRole);
    if (!domainMatched && !strictTitleEmployer && !snippetShowsCurrentEmployment) {
      return reject;
    }
  } else {
    if (!domainMatched && !titleMentionsCompany && !snippetShowsCurrentEmployment) {
      return reject;
    }
  }

  if (/\b(?:open\s+to\s+work|seeking\s+opportunities|incoming\s+intern)\b/iu.test(personRole)) {
    return reject;
  }

  const isFounder = /\b(?:co-?founder|founder|ceo|cto)\b/iu.test(personRole);
  const isRecruiter = /\b(?:recruiter|talent|hr|people\s+ops|hiring)\b/iu.test(personRole);
  const isManager = /\b(?:manager|lead|head\s+of|director|vp)\b/iu.test(personRole);

  const evidenceSnippet = snippet
    ? snippet.slice(0, 220)
    : `LinkedIn headline: ${cleanedTitle}`;

  return {
    accepted: true,
    personName,
    personRole: (personRole || `Team Member at ${cleanCompany}`).slice(0, 130),
    evidenceSnippet,
    contactType: isFounder ? 'founder' : isRecruiter ? 'recruiter' : isManager ? 'hiring_manager' : 'engineer_referral',
  };
}

export function extractPublicEmails(text: string): string[] {
  const matches = text.match(PUBLIC_EMAIL_REGEX) ?? [];
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const raw of matches) {
    const email = raw.trim().toLowerCase();
    if (IGNORED_EMAIL_PREFIX.test(email) || seen.has(email)) continue;
    if (/\.(?:png|jpg|jpeg|svg|gif|webp|css|js|woff2?)$/iu.test(email)) continue;
    seen.add(email);
    valid.push(email);
  }
  return valid;
}

async function resolveCompanyOfficialWebsite(
  companyName: string,
  firecrawlApiKey: string,
): Promise<{ websiteUrl: string | null; domain: string | null; creditsUsed: number; error: string | null }> {
  const cleanCompany = cleanCompanyNameForLookup(companyName);
  if (cleanCompany.length < 2) return { websiteUrl: null, domain: null, creditsUsed: 0, error: null };

  const res = await firecrawlWebSearch({
    apiKey: firecrawlApiKey,
    query: `"${cleanCompany}" official website OR careers`,
    limit: 5,
  });

  if (!res.ok) return { websiteUrl: null, domain: null, creditsUsed: 1, error: res.error };

  const compactSlug = cleanCompany.toLowerCase().replace(/[^a-z0-9]/gu, '');
  const firstToken = cleanCompany.toLowerCase().split(/\s+/u)[0] ?? '';

  for (const hit of res.hits) {
    const domain = extractDomainHost(hit.url);
    if (!domain) continue;
    const domainNoTld = domain.split('.')[0]?.replace(/[^a-z0-9]/gu, '') ?? '';
    if (
      domainNoTld === compactSlug
      || (compactSlug.length >= 4 && domainNoTld.includes(compactSlug))
      || (firstToken.length >= 5 && domainNoTld.includes(firstToken))
    ) {
      try {
        return { websiteUrl: new URL(hit.url).origin, domain, creditsUsed: 1, error: null };
      } catch {
        continue;
      }
    }
  }
  return { websiteUrl: null, domain: null, creditsUsed: 1, error: null };
}

async function resolveGithubOrgPeople(
  companyName: string,
  companyDomain: string | null,
  githubToken: string | null,
  jobTitle: string,
  ollama?: OllamaRuntimeOptions,
): Promise<DiscoveredContactCandidate[]> {
  const cleanName = cleanCompanyNameForLookup(companyName);
  const guessedSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/gu, '');
  if (guessedSlug.length < 2) return [];
  if (guessedSlug.length <= 4 && !companyDomain) return [];

  const ghHeaders: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'CareerScout-Local/0.7',
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

  type GhOrg = { login?: string; name?: string | null; blog?: string | null; html_url?: string };

  let verifiedOrg: GhOrg | null = null;
  const directOrg = await ghFetch<GhOrg>(`https://api.github.com/orgs/${encodeURIComponent(guessedSlug)}`);
  if (
    directOrg?.login
    && isValidGithubOrgMatch({
      companyName: cleanName,
      companyDomain,
      orgLogin: directOrg.login,
      orgName: directOrg.name ?? null,
      orgBlog: directOrg.blog ?? null,
    })
  ) {
    verifiedOrg = directOrg;
  }

  if (!verifiedOrg && (guessedSlug.length >= 5 || companyDomain)) {
    const searchQuery = companyDomain ? `${cleanName} ${companyDomain} type:org` : `${cleanName} type:org`;
    const searchRes = await ghFetch<{ items?: Array<{ login?: string }> }>(
      `https://api.github.com/search/users?q=${encodeURIComponent(searchQuery)}&per_page=3`,
    );
    for (const item of searchRes?.items ?? []) {
      if (!item.login) continue;
      const orgDetails = await ghFetch<GhOrg>(`https://api.github.com/orgs/${encodeURIComponent(item.login)}`);
      if (
        orgDetails?.login
        && isValidGithubOrgMatch({
          companyName: cleanName,
          companyDomain,
          orgLogin: orgDetails.login,
          orgName: orgDetails.name ?? null,
          orgBlog: orgDetails.blog ?? null,
        })
      ) {
        verifiedOrg = orgDetails;
        break;
      }
    }
  }

  if (!verifiedOrg?.login) return [];
  const orgLogin = verifiedOrg.login;

  const members = await ghFetch<Array<{ login?: string }>>(
    `https://api.github.com/orgs/${encodeURIComponent(orgLogin)}/public_members?per_page=6`,
  );
  const logins = (members ?? []).map((m) => m.login).filter((l): l is string => Boolean(l));
  if (logins.length === 0) return [];

  const resolved: DiscoveredContactCandidate[] = [];
  for (const login of logins.slice(0, 4)) {
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

    const companyField = (user.company ?? '').trim();
    const bioField = (user.bio ?? '').trim();
    if (indicatesFormerEmployeeAtCompany(`${companyField}\n${bioField}`, cleanName)) continue;

    if (companyField) {
      const normCompanyField = companyField.replace(/^@/u, '').toLowerCase();
      const matchesTarget =
        normCompanyField.includes(cleanName.toLowerCase())
        || normCompanyField.includes(orgLogin.toLowerCase());
      if (!matchesTarget) continue;
    }

    const fallbackRole = `Engineer at ${cleanName} (@${orgLogin} GitHub member)`;
    const roleTitle = sanitizeBioRole(user.bio, fallbackRole);
    const isManager = /\b(?:manager|lead|cto|vp|head\s+of|founder|director|staff|principal)\b/iu.test(roleTitle);
    const blogRaw = user.blog?.trim() || '';
    const blogUrl = blogRaw ? (/^https?:\/\//iu.test(blogRaw) ? blogRaw : `https://${blogRaw}`) : null;
    const isLinkedInBlog = Boolean(blogUrl && /linkedin\.com\/in\//iu.test(blogUrl));
    const profileUrl = isLinkedInBlog ? blogUrl! : (user.html_url || `https://github.com/${login}`);

    const proofParts = [
      `Verified public member of GitHub org @${orgLogin}${verifiedOrg.blog ? ` (${verifiedOrg.blog})` : ''}.`,
      companyField ? `GitHub company field: ${companyField}.` : null,
      bioField ? `Bio: ${bioField.slice(0, 120)}.` : null,
      blogUrl && !isLinkedInBlog ? `Website: ${blogUrl}` : null,
    ].filter(Boolean);
    const evidenceText = proofParts.join(' ');

    if (ollama?.enabled) {
      const aiCheck = await verifyCurrentEmployeeWithAi({
        ollama,
        targetCompany: cleanName,
        targetDomain: companyDomain,
        jobTitle,
        personName: realName || login,
        personHeadline: `${roleTitle}${companyField ? ` | Company: ${companyField}` : ''}`,
        profileUrl,
        evidenceSnippet: evidenceText,
        platform: 'github',
      });
      if (aiCheck && (!aiCheck.currentlyWorksAtTarget || !aiCheck.isRelevantContact)) {
        continue;
      }
    }

    resolved.push({
      fullName: realName || login,
      roleTitle,
      contactType: isManager ? 'hiring_manager' : 'engineer_referral',
      email,
      profileUrl,
      platform: email ? 'email' : isLinkedInBlog ? 'linkedin' : 'github',
      sourceUrl: `https://github.com/orgs/${orgLogin}/people`,
      sourceNote: evidenceText,
      confidence: email || Boolean(companyField) ? 'verified' : 'likely',
    });
    if (resolved.length >= 2) break;
  }
  return resolved;
}

async function scanCompanySiteForRealEmails(companyName: string, siteUrl: string | null | undefined): Promise<DiscoveredContactCandidate[]> {
  if (!siteUrl) return [];
  const domain = extractDomainHost(siteUrl);
  if (!domain) return [];

  try {
    const origin = new URL(/^https?:\/\//iu.test(siteUrl) ? siteUrl : `https://${siteUrl}`).origin;
    const foundEmails = new Set<string>();
    const pagesToTry = [origin, `${origin}/careers`, `${origin}/about`, `${origin}/team`, `${origin}/contact`];

    for (const url of pagesToTry) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'CareerScout-Local/0.7' },
          signal: AbortSignal.timeout(5500),
        });
        if (!res.ok) continue;
        const html = (await res.text()).slice(0, 140_000);
        for (const email of extractPublicEmails(html)) {
          const emailDomain = email.split('@')[1]?.toLowerCase() ?? '';
          const sameDomain = emailDomain === domain || emailDomain.endsWith(`.${domain}`);
          const relevantPrefix = /(?:career|job|recruit|talent|hr|hiring|people|founder|team|hello|contact|work|intern|engineering|cto|ceo)/iu.test(email);
          if (sameDomain || relevantPrefix) {
            foundEmails.add(email);
          }
        }
        if (foundEmails.size >= 2) break;
      } catch {
        // Ignore unreachable subpage
      }
    }

    const cleanName = cleanCompanyNameForLookup(companyName);
    return [...foundEmails].slice(0, 2).map((email) => ({
      fullName: /(?:founder|ceo|cto)/iu.test(email)
        ? `${cleanName} Founders`
        : /(?:career|job|recruit|talent|hr|hiring)/iu.test(email)
          ? `${cleanName} Recruiting`
          : `${cleanName} Team`,
      roleTitle: /(?:career|job|recruit|talent|hr|hiring)/iu.test(email) ? 'Recruiting / Careers Inbox' : 'Official Company Inbox',
      contactType: /(?:founder|ceo|cto)/iu.test(email) ? 'founder' : /(?:career|job|recruit|talent|hr|hiring)/iu.test(email) ? 'recruiter' : 'talent_team',
      email,
      profileUrl: origin,
      platform: 'email',
      sourceUrl: origin,
      sourceNote: `Verified public email scraped directly from official site ${domain}.`,
      confidence: 'verified',
    }));
  } catch {
    return [];
  }
}

async function discoverNamedPeopleViaFirecrawl(options: {
  apiKey: string;
  companyName: string;
  companyDomain: string | null;
  roleTitle: string;
  ollama?: OllamaRuntimeOptions;
}): Promise<{
  contacts: DiscoveredContactCandidate[];
  creditsUsed: number;
  hitsReturned: number;
  rejected: number;
  error: string | null;
}> {
  const cleanCompany = cleanCompanyNameForLookup(options.companyName);
  if (cleanCompany.length < 2) {
    return { contacts: [], creditsUsed: 0, hitsReturned: 0, rejected: 0, error: null };
  }

  // Broad, realistic LinkedIn query (NO overly strict "at Company" quotes and NO "-former -alumni" exclusions)
  const companyClause = options.companyDomain
    ? `("${cleanCompany}" OR "${options.companyDomain}")`
    : `"${cleanCompany}"`;
  const query = `site:linkedin.com/in ${companyClause} ("Founder" OR "Co-Founder" OR "CTO" OR "Engineering Manager" OR "Tech Lead" OR "Recruiter" OR "Talent" OR "Software Engineer")`;

  const res = await firecrawlWebSearch({
    apiKey: options.apiKey,
    query,
    limit: 8,
  });

  if (!res.ok) {
    return { contacts: [], creditsUsed: 1, hitsReturned: 0, rejected: 0, error: res.error };
  }

  const contacts: DiscoveredContactCandidate[] = [];
  let rejected = 0;

  for (const hit of res.hits) {
    const check = verifyLinkedinSearchHit(hit, cleanCompany, options.companyDomain);
    if (!check.accepted) {
      rejected += 1;
      continue;
    }

    const cleanUrl = hit.url.replace(/[?#].*$/u, '');
    let aiReasonNote = '';

    if (options.ollama?.enabled) {
      const aiCheck = await verifyCurrentEmployeeWithAi({
        ollama: options.ollama,
        targetCompany: cleanCompany,
        targetDomain: options.companyDomain,
        jobTitle: options.roleTitle,
        personName: check.personName,
        personHeadline: check.personRole,
        profileUrl: cleanUrl,
        evidenceSnippet: `${hit.title} | ${hit.description || hit.markdown || ''}`,
        platform: 'linkedin',
      });
      if (aiCheck && (!aiCheck.currentlyWorksAtTarget || !aiCheck.isRelevantContact)) {
        rejected += 1;
        continue;
      }
      if (aiCheck?.reason) aiReasonNote = ` [AI verified: ${aiCheck.reason}]`;
    }

    contacts.push({
      fullName: check.personName,
      roleTitle: check.personRole,
      contactType: check.contactType,
      email: null,
      profileUrl: cleanUrl,
      platform: 'linkedin',
      sourceUrl: cleanUrl,
      sourceNote: `Matched via current-employee LinkedIn proof: "${check.evidenceSnippet}"${aiReasonNote}`,
      confidence: 'likely',
    });
    if (contacts.length >= 2) break;
  }

  return {
    contacts,
    creditsUsed: 1,
    hitsReturned: res.hits.length,
    rejected,
    error: null,
  };
}

async function discoverStartupFoundersOrEmailsViaFirecrawl(options: {
  apiKey: string;
  companyName: string;
  companyDomain: string | null;
}): Promise<{ contacts: DiscoveredContactCandidate[]; creditsUsed: number; error: string | null }> {
  const cleanCompany = cleanCompanyNameForLookup(options.companyName);
  if (cleanCompany.length < 2) return { contacts: [], creditsUsed: 0, error: null };

  const query = options.companyDomain
    ? `"@${options.companyDomain}" OR (site:linkedin.com/in "${cleanCompany}")`
    : `"${cleanCompany}" (site:linkedin.com/in OR "careers@" OR "founders@" OR "hiring@" OR "hello@")`;

  const res = await firecrawlWebSearch({
    apiKey: options.apiKey,
    query,
    limit: 6,
  });

  if (!res.ok) return { contacts: [], creditsUsed: 1, error: res.error };

  const contacts: DiscoveredContactCandidate[] = [];
  for (const hit of res.hits) {
    // 1. Check for LinkedIn profiles returned by the simpler fallback query
    if (/linkedin\.com\/in\/[^/?#]+/iu.test(hit.url)) {
      const check = verifyLinkedinSearchHit(hit, cleanCompany, options.companyDomain);
      if (check.accepted) {
        const cleanUrl = hit.url.replace(/[?#].*$/u, '');
        contacts.push({
          fullName: check.personName,
          roleTitle: check.personRole,
          contactType: check.contactType,
          email: null,
          profileUrl: cleanUrl,
          platform: 'linkedin',
          sourceUrl: cleanUrl,
          sourceNote: `Found via fallback LinkedIn lookup: "${check.evidenceSnippet}"`,
          confidence: 'likely',
        });
      }
      continue;
    }

    // 2. Check for real company-domain emails in snippets
    const snippet = `${hit.title} ${hit.description ?? ''} ${hit.markdown ?? ''}`;
    for (const email of extractPublicEmails(snippet)) {
      const emailDomain = email.split('@')[1]?.toLowerCase() ?? '';
      const compactSlug = cleanCompany.toLowerCase().replace(/[^a-z0-9]/gu, '');
      const matchesCompany =
        (options.companyDomain && (emailDomain === options.companyDomain || emailDomain.endsWith(`.${options.companyDomain}`)))
        || (compactSlug.length >= 4 && emailDomain.replace(/[^a-z0-9]/gu, '').includes(compactSlug));
      if (!matchesCompany) continue;
      if (contacts.some((c) => c.email?.toLowerCase() === email)) continue;

      contacts.push({
        fullName: `${cleanCompany} Contact`,
        roleTitle: /(?:career|job|recruit|hiring|talent)/iu.test(email) ? 'Hiring / Recruiting Email' : 'Direct Company Email',
        contactType: /(?:founder|ceo|cto)/iu.test(email) ? 'founder' : 'recruiter',
        email,
        profileUrl: hit.url,
        platform: 'email',
        sourceUrl: hit.url,
        sourceNote: `Published company email found via web search at ${hit.url}.`,
        confidence: 'verified',
      });
    }
    if (contacts.length >= 2) break;
  }

  return { contacts: contacts.slice(0, 2), creditsUsed: 1, error: null };
}

export async function discoverCompanyContacts(
  job: RawDiscoveredJob,
  options: {
    deepLookup: boolean;
    firecrawlApiKey?: string | null;
    githubToken?: string | null;
    ollama?: OllamaRuntimeOptions;
  },
): Promise<{
  contacts: DiscoveredContactCandidate[];
  firecrawlCreditsUsed: number;
  diagnostics: ContactDiscoveryDiagnostics;
}> {
  const contacts: DiscoveredContactCandidate[] = [];
  const company = cleanCompanyNameForLookup(job.companyName) || job.companyName.trim();
  let companyWebsite = job.companyWebsite ?? null;
  let companyDomain = extractDomainHost(companyWebsite) ?? extractDomainHost(job.sourceUrl);
  let firecrawlCreditsUsed = 0;

  const diagnostics: ContactDiscoveryDiagnostics = {
    resolvedDomain: companyDomain,
    linkedinHitsReturned: 0,
    linkedinRejected: 0,
    founderWebHits: 0,
    siteEmailsFound: 0,
    githubMembersFound: 0,
    firecrawlError: null,
  };

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
      sourceNote: `Email explicitly published inside the job description at ${job.sourceUrl}.`,
      confidence: 'verified',
    });
  }

  // 3. Deep multi-stage real-people waterfall
  if (options.deepLookup) {
    // 3a. If we don't know the company's real website domain yet (e.g., Wellfound/Internshala listing), resolve it first
    if (!companyDomain && options.firecrawlApiKey?.trim()) {
      const resolvedSite = await resolveCompanyOfficialWebsite(company, options.firecrawlApiKey.trim());
      firecrawlCreditsUsed += resolvedSite.creditsUsed;
      if (resolvedSite.error) diagnostics.firecrawlError = resolvedSite.error;
      if (resolvedSite.domain) {
        companyDomain = resolvedSite.domain;
        companyWebsite = resolvedSite.websiteUrl;
        diagnostics.resolvedDomain = companyDomain;
      }
    }

    // 3b. Official company site email scraping + verified GitHub org public members
    const [ghPeople, siteEmails] = await Promise.all([
      resolveGithubOrgPeople(company, companyDomain, options.githubToken ?? null, job.title, options.ollama),
      scanCompanySiteForRealEmails(company, companyWebsite),
    ]);
    diagnostics.githubMembersFound = ghPeople.length;
    diagnostics.siteEmailsFound = siteEmails.length;

    for (const item of [...siteEmails, ...ghPeople]) {
      const dup = contacts.some(
        (c) =>
          (item.email && c.email?.toLowerCase() === item.email.toLowerCase())
          || (item.profileUrl && c.profileUrl === item.profileUrl),
      );
      if (!dup) contacts.push(item);
    }

    // 3c. Firecrawl v2 LinkedIn current-employee lookup
    if (options.firecrawlApiKey?.trim() && contacts.length < 2 && !diagnostics.firecrawlError) {
      const fc = await discoverNamedPeopleViaFirecrawl({
        apiKey: options.firecrawlApiKey.trim(),
        companyName: company,
        companyDomain,
        roleTitle: job.title,
        ollama: options.ollama,
      });
      firecrawlCreditsUsed += fc.creditsUsed;
      diagnostics.linkedinHitsReturned = fc.hitsReturned;
      diagnostics.linkedinRejected = fc.rejected;
      if (fc.error) diagnostics.firecrawlError = fc.error;

      for (const person of fc.contacts) {
        if (!contacts.some((c) => c.profileUrl === person.profileUrl)) {
          contacts.push(person);
        }
      }
    }

    // 3d. Fallback startup founder/email web lookup if STILL 0 contacts found
    if (options.firecrawlApiKey?.trim() && contacts.length === 0 && !diagnostics.firecrawlError) {
      const fb = await discoverStartupFoundersOrEmailsViaFirecrawl({
        apiKey: options.firecrawlApiKey.trim(),
        companyName: company,
        companyDomain,
      });
      firecrawlCreditsUsed += fb.creditsUsed;
      diagnostics.founderWebHits = fb.contacts.length;
      if (fb.error) diagnostics.firecrawlError = fb.error;

      for (const person of fb.contacts) {
        if (!contacts.some((c) => (person.email && c.email === person.email) || (person.profileUrl && c.profileUrl === person.profileUrl))) {
          contacts.push(person);
        }
      }
    }
  }

  return { contacts, firecrawlCreditsUsed, diagnostics };
}

function firstNameOf(fullName: string): string {
  const cleaned = fullName.replace(/\(.*?\)/gu, '').trim();
  if (/hiring|team|recruiting|contact|founders/iu.test(cleaned)) return cleaned;
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
  ollama: OllamaRuntimeOptions,
  matchScore = 70,
  options: { skipFallbackIfNoContacts?: boolean } = {},
): Promise<GeneratedDraftProposal[]> {
  const company = cleanCompanyNameForLookup(job.companyName) || job.companyName.trim();
  const role = job.title.trim();
  const cleanJobUrl = await resolveRedirectUrl(job.sourceUrl);
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

  const prioritized = contacts
    .map((c, index) => ({ contact: c, index }))
    .sort((a, b) => {
      const rank = (c: DiscoveredContactCandidate) =>
        c.email ? 4 : c.contactType === 'founder' || c.contactType === 'hiring_manager' ? 3 : c.platform === 'linkedin' ? 2 : 1;
      return rank(b.contact) - rank(a.contact);
    })
    .slice(0, 2);

  for (const { contact, index } of prioritized) {
    const greetingName = firstNameOf(contact.fullName);
    const isReferral = contact.contactType === 'engineer_referral';
    const safeRolePhrase =
      contact.roleTitle && /[a-zA-Z]{4,}/u.test(contact.roleTitle) && !/github member/iu.test(contact.roleTitle)
        ? ` (${contact.roleTitle})`
        : '';

    const rawBody = isReferral
      ? [
          `Hi ${greetingName},`,
          '',
          `I came across your profile${safeRolePhrase} while researching the ${role} opening at ${company}.`,
          '',
          `${eduSentence}${topSkills.length ? `, working with ${topSkills.slice(0, 5).join(', ')}` : ''}. ${projectSentence}`.trim(),
          '',
          `If my background looks like a fit for the team at ${company}, would you be open to sharing a quick referral or pointing me toward the hiring manager for the ${role} role?`,
          linksLine ? `\n${linksLine}` : '',
          '',
          `Thanks for your time,`,
          profile.displayName,
        ].filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n')
      : [
          `Hi ${greetingName},`,
          '',
          `I saw the ${role} opening at ${company} (${cleanJobUrl}) and wanted to reach out directly.`,
          '',
          `${eduSentence}${topSkills.length ? `, building projects with ${topSkills.slice(0, 5).join(', ')}` : ''}. ${projectSentence}`.trim(),
          '',
          `I would love to be considered for the ${role} position at ${company} and am happy to share my resume or walk through my code.`,
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
        timeoutMs: 90_000,
        numPredict: 320,
        temperature: 0.2,
        system: [
          'You rewrite short internship outreach messages for a real computer science student.',
          'FOLLOW EVERY RULE STRICTLY:',
          `1. Write ONLY about the "${role}" role at "${company}". NEVER mention any other company.`,
          `2. Address the message to "${greetingName}".`,
          '3. Keep it between 70 and 130 words.',
          '4. Use ONLY the verified skills, projects, education, and links given below. NEVER invent facts, metrics, or links.',
          '5. Do NOT use em dashes (—) or clichés ("thrilled", "keen interest", "eager to leverage", "invaluable asset").',
          '6. Return ONLY the ready-to-send message text with greeting and sign-off. No intro or notes.',
        ].join('\n'),
        user: [
          `TARGET COMPANY: ${company}`,
          `TARGET ROLE: ${role}`,
          `RECIPIENT: ${contact.fullName} (${contact.roleTitle ?? company})`,
          `GOAL: ${isReferral ? 'Politely ask for a referral or hiring manager pointer' : 'Express direct interest in applying'}`,
          `VERIFIED CANDIDATE FACTS:\n${groundingFacts.join('\n')}`,
          `SIGN-OFF NAME: ${profile.displayName}`,
          '',
          `STARTING DRAFT TO IMPROVE:\n${rawBody}`,
        ].join('\n'),
      });
      if (polished) {
        const cleaned = polished.replace(/\s*[—–]\s*/gu, ', ').trim();
        const words = cleaned.split(/\s+/u).filter(Boolean).length;
        const mentionsCompany = cleaned.toLowerCase().includes(company.toLowerCase());
        if (mentionsCompany && words >= 45 && words <= 185) {
          finalBody = cleaned;
        }
      }
    }

    proposals.push({
      channel: contact.email ? 'email' : isReferral ? 'referral_request' : 'linkedin_dm',
      recipientLabel: `${contact.fullName}${contact.roleTitle ? ` - ${contact.roleTitle}` : ''}`,
      recipientTarget: contact.email ?? contact.profileUrl ?? null,
      subject: isReferral
        ? `Referral inquiry: ${role} at ${company} - ${profile.displayName}`
        : `Application: ${role} - ${profile.displayName}`,
      body: finalBody,
      groundingFacts,
      contactIndex: index,
    });
  }

  // Only create a cover_letter pitch when no real contact was found AND caller hasn't disabled fallback.
  // NEVER paste the job URL or a Google redirect link into recipientTarget—keep recipientTarget cleanly null!
  if (proposals.length === 0 && !options.skipFallbackIfNoContacts && matchScore >= 55) {
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
      recipientLabel: `${company} Hiring Team (no verified person found yet)`,
      recipientTarget: null,
      subject: `Application: ${role} - ${profile.displayName}`,
      body: pitchBody,
      groundingFacts,
      contactIndex: null,
    });
  }

  return proposals;
}

import { createHash } from 'node:crypto';
import type {
  CompensationStatus,
  CountryScope,
  EvaluatedJob,
  JobEmploymentType,
  JobWorkArrangement,
  RawDiscoveredJob,
  UserProfileContext,
} from './types.js';

const ROLE_SYNONYM_GROUPS: Array<{ keywords: RegExp; category: string }> = [
  { keywords: /\b(?:full[\s-]?stack|mern|pern|mean)\b/iu, category: 'full_stack' },
  { keywords: /\b(?:front[\s-]?end|ui\s+engineer|ui\s+developer|react\s+(?:dev|developer|engineer)|web\s+developer)\b/iu, category: 'frontend' },
  { keywords: /\b(?:back[\s-]?end|api\s+engineer|node\.?js\s+(?:dev|developer|engineer)|server[\s-]?side)\b/iu, category: 'backend' },
  { keywords: /\b(?:software\s+(?:engineer(?:ing)?|developer|development|dev)|swe\b|sde\b|application\s+developer|web\s+engineer|product\s+engineer(?:ing)?)\b/iu, category: 'software_engineering' },
  { keywords: /\b(?:devops|sre|site\s+reliability|cloud\s+engineer|platform\s+engineer)\b/iu, category: 'devops' },
  { keywords: /\b(?:data\s+(?:scientist|engineer|analyst)|machine\s+learning|ml\s+engineer|ai\s+engineer)\b/iu, category: 'data' },
  { keywords: /\b(?:mobile\s+(?:developer|engineer)|ios\s+developer|android\s+developer|react\s+native|flutter)\b/iu, category: 'mobile' },
];

const SENIOR_TITLE_PATTERN = /\b(?:senior|sr\.?|staff|principal|distinguished|architect|vp|vice\s+president|head\s+of|director|chief|cto|manager|engineering\s+manager|lead|tech\s+lead|team\s+lead|iii|iv|v)\b/iu;
const INTERN_TITLE_PATTERN = /\b(?:intern|internship|co-?op|trainee|apprentice(?:ship)?|student\s+(?:developer|engineer))\b/iu;
const JUNIOR_PATTERN = /\b(?:entry[\s-]?level|junior|jr\.?|new\s+grad|graduate|fresher|associate|early[\s-]?career|level\s*1|l1|sde[\s-]?1|swe[\s-]?1)\b/iu;
const HEAVY_EXPERIENCE_PATTERN = /\b(?:[3-9]|1\d)\s*\+?\s*(?:-\s*\d+\s*)?years?\s+(?:of\s+)?(?:professional\s+|industry\s+|software\s+|relevant\s+|work\s+|hands[- ]?on\s+)?experience\b/iu;

// Reject non-software / hardware / specialized non-web engineering titles when targeting SWE/Web roles
const NON_WEB_SWE_NOISE_TITLE = /\b(?:sales|account\s+executive|business\s+development|marketing|recruiter|talent\s+acquisition|human\s+resources|customer\s+support|customer\s+success|copywriter|graphic\s+designer|nurse|pharmacist|lawyer|counsel|finance|accountant|payroll|annuities|insurance|underwriting|actuarial|supply\s+chain|warehouse|battery|mechanical|civil|electrical|hardware|firmware|embedded|automotive|vehicle|adas|infotainment|aerospace|avionics|manufacturing|simulation|rack\/cluster|silicon|asic|fpga|vlsi|rf\s+engineer|chemical|biotech|clinical|quantum|cheminformatics|accounting|audit|tax|masters?\s+only|ph\.?d\.?\s+(?:intern|research)|research\s+intern|data\s+science|data\s+engineering|data\s+analyst|security\s+clearance|ts\/sci)\b/iu;

const US_STATE_ABBR = /\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/u;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'in', 'at', 'of', 'to', 'a', 'an', 'or', 'on',
  'role', 'position', 'job', 'remote', 'hybrid', 'onsite',
  'intern', 'internship', 'student', 'co-op', 'coop', 'summer', 'winter', 'fall', 'spring',
  'engineer', 'engineering', 'developer', 'development', 'junior', 'entry', 'level', 'associate',
]);

export function normalizeCompanyName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\b(?:inc\.?|ltd\.?|llc|corp\.?|corporation|pvt\.?|private|limited|technologies|technology|labs?|studios?|solutions?)\b/gu, '')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

export function buildJobFingerprint(job: RawDiscoveredJob): string {
  const normCompany = normalizeCompanyName(job.companyName);
  const normTitle = job.title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\b(?:202[5-9]|summer|winter|fall|spring)\b/gu, '')
    .replace(/[^a-z0-9+#]+/gu, ' ')
    .trim();
  const normLoc = (job.locationText ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .slice(0, 60);

  // Deduplicate identical (company, role title, location) postings even across different requisition URLs
  const payload = `${normCompany}|${normTitle}|${normLoc}`;
  return createHash('sha256').update(payload).digest('hex');
}

export function detectWorkArrangement(
  title: string,
  location: string,
  description: string,
  explicit?: JobWorkArrangement | null,
): JobWorkArrangement {
  if (explicit && explicit !== 'unknown') return explicit;
  const header = `${title} ${location}`;
  if (/\b(?:remote|work\s+from\s+home|wfh|distributed|anywhere)\b/iu.test(header)) return 'remote';
  if (/\bhybrid\b/iu.test(header)) return 'hybrid';
  if (/\b(?:on[\s-]?site|in[\s-]?office|in[\s-]?person)\b/iu.test(header)) return 'onsite';
  const snippet = description.slice(0, 1400);
  if (/\b(?:fully\s+remote|100%\s+remote|remote[\s-]?first|work\s+from\s+home)\b/iu.test(snippet)) return 'remote';
  if (/\bhybrid\b/iu.test(snippet)) return 'hybrid';
  if (/\b(?:on[\s-]?site|in[\s-]?office)\b/iu.test(snippet)) return 'onsite';
  // If a concrete city/state or city/country is specified with no Remote/Hybrid keyword, treat as on-site
  if (
    location.trim().length >= 3
    && (location.includes(',') || US_STATE_ABBR.test(location) || /\b(?:nyc|sf|london|paris|berlin|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|chennai|noida|gurgaon|gurugram)\b/iu.test(location))
  ) {
    return 'onsite';
  }
  return 'unknown';
}

export function detectEmploymentType(
  title: string,
  description: string,
  tags: string[],
  explicit?: JobEmploymentType | null,
): JobEmploymentType {
  if (explicit && explicit !== 'unknown') return explicit;
  if (INTERN_TITLE_PATTERN.test(title)) return 'internship';
  if (tags.some((t) => /\bintern(?:ship)?\b/iu.test(t))) return 'internship';
  if (/\b(?:contract|contractor|freelance)\b/iu.test(title)) return 'contract';
  if (/\bpart[\s-]?time\b/iu.test(title)) return 'part_time';
  const snippet = description.slice(0, 600);
  if (/\b(?:this\s+internship|as\s+an?\s+(?:software|engineering|developer|frontend|backend|full[\s-]?stack)?\s*intern|internship\s+program|summer\s+intern)\b/iu.test(snippet)) {
    return 'internship';
  }
  if (/\bpart[\s-]?time\b/iu.test(snippet)) return 'part_time';
  if (/\bcontract(?:or)?\b/iu.test(snippet)) return 'contract';
  if (/\bfull[\s-]?time\b/iu.test(`${title} ${snippet}`)) return 'full_time';
  return 'unknown';
}

export function detectCompensationStatus(salaryText: string, description: string): CompensationStatus {
  const combined = `${salaryText} ${description.slice(0, 1600)}`;
  if (/\b(?:unpaid|no\s+stipend|without\s+pay|volunteer\s+only|zero\s+stipend|uncompensated)\b/iu.test(combined)) {
    return 'unpaid';
  }
  if (
    salaryText.trim().length > 0
    || /(?:₹|\$|€|£|\binr\b|\busd\b|\beur\b|\bgbp\b|\blpa\b|\bstipend\b|\bpaid\s+internship\b|\bcompetitive\s+salary\b|\bcompensation\b)/iu.test(combined)
  ) {
    return 'paid';
  }
  return 'unspecified';
}

export function detectCountryScope(
  locationText: string,
  description: string,
  userCountry: string | null,
  preferredCountries: string[],
): CountryScope {
  const loc = locationText.trim();
  const homeCountries = Array.from(
    new Set([userCountry, ...preferredCountries].filter((c): c is string => Boolean(c && c.trim())).map((c) => c.trim().toLowerCase())),
  );

  if (homeCountries.length > 0) {
    for (const country of homeCountries) {
      const escaped = country.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'iu').test(loc)) return 'national';
      if (country === 'india' && /\b(?:bengaluru|bangalore|delhi|ncr|noida|gurgaon|gurugram|mumbai|pune|hyderabad|chennai|kolkata|chandigarh|himachal|punjab|ahmedabad|jaipur)\b/iu.test(loc)) {
        return 'national';
      }
    }
  }

  // Country-locked remote (e.g. "Remote in USA", "Remote in Canada", "US Remote") is international, NOT global remote
  if (/\bremote\s+(?:in|only\s+in|-)\s*(?:usa|u\.s\.a?\.?|united\s+states|canada|uk|united\s+kingdom|europe|eu|germany|france)\b/iu.test(loc)
    || /\b(?:us|usa|canada|uk)\s+remote\b/iu.test(loc)) {
    return 'international';
  }

  if (/\b(?:worldwide|global|anywhere|international|remote\s*-\s*global|all\s+regions)\b/iu.test(`${loc} ${description.slice(0, 500)}`)) {
    return 'remote_global';
  }

  if (loc.length >= 2 && !/^remote$/iu.test(loc)) {
    return 'international';
  }

  if (/^remote$/iu.test(loc)) return 'remote_global';
  return 'unknown';
}

function tokenizeSpecific(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/gu, ' ')
    .split(/[\s/-]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

function inferRoleCategory(title: string): string | null {
  for (const group of ROLE_SYNONYM_GROUPS) {
    if (group.keywords.test(title)) return group.category;
  }
  return null;
}

export function userStrictlyTargetsInternships(profile: UserProfileContext): boolean {
  if (profile.preferredRoles.length === 0) return false;
  return profile.preferredRoles.every(
    (role) => role.seniority === 'internship' || INTERN_TITLE_PATTERN.test(role.title),
  );
}

function matchTargetRole(
  jobTitle: string,
  jobTags: string[],
  preferredRoles: UserProfileContext['preferredRoles'],
): { matchedTitle: string | null; score: number; reason: string | null } {
  if (preferredRoles.length === 0) {
    return { matchedTitle: 'General Software Role', score: 20, reason: 'No target roles configured yet' };
  }

  const normalizedJob = jobTitle.toLowerCase();
  const jobTokens = new Set(tokenizeSpecific(`${jobTitle} ${jobTags.join(' ')}`));
  const jobCategory = inferRoleCategory(jobTitle);

  let bestMatch: { matchedTitle: string; score: number; reason: string } | null = null;

  for (const role of preferredRoles) {
    const targetLower = role.title.toLowerCase();
    const targetTokens = tokenizeSpecific(role.title);
    const targetCategory = role.category || inferRoleCategory(role.title);

    // 1. Direct phrase match
    if (normalizedJob.includes(targetLower) || targetLower.includes(normalizedJob)) {
      const candidate = { matchedTitle: role.title, score: 44, reason: `Direct title match for “${role.title}”` };
      if (!bestMatch || candidate.score > bestMatch.score) bestMatch = candidate;
      continue;
    }

    // 2. Strict category match (requires an explicit software/frontend/backend/full-stack match in the job title)
    const categoryHit = Boolean(targetCategory && jobCategory && (
      targetCategory === jobCategory
      || (targetCategory === 'software_engineering' && ['full_stack', 'frontend', 'backend'].includes(jobCategory))
      || (['full_stack', 'frontend', 'backend'].includes(targetCategory) && jobCategory === 'software_engineering')
    ));

    // 3. Domain-specific token overlap (generic words like "engineering", "intern", "developer" are excluded)
    const overlap = targetTokens.filter((t) => jobTokens.has(t));
    const ratio = targetTokens.length > 0 ? overlap.length / targetTokens.length : 0;

    let points = 0;
    let reason = '';
    if (categoryHit && ratio >= 0.5) {
      points = 40;
      reason = `Strong match for target role “${role.title}”`;
    } else if (categoryHit) {
      points = 34;
      reason = `Matches target track “${role.title}”`;
    } else if (targetTokens.length >= 1 && ratio >= 0.75 && overlap.length >= 1) {
      points = 32;
      reason = `Matches target domain from “${role.title}” (${overlap.join(', ')})`;
    }

    if (points > 0 && (!bestMatch || points > bestMatch.score)) {
      bestMatch = { matchedTitle: role.title, score: points, reason };
    }
  }

  return bestMatch ?? { matchedTitle: null, score: 0, reason: null };
}

export function evaluateJobAgainstProfile(job: RawDiscoveredJob, profile: UserProfileContext): EvaluatedJob {
  const fingerprint = buildJobFingerprint(job);
  const title = job.title.trim();
  const description = (job.description ?? '').trim();
  const locationText = (job.locationText ?? '').trim();
  const salaryText = (job.salaryText ?? '').trim();
  const tags = job.tags ?? [];

  const workArrangement = detectWorkArrangement(title, locationText, description, job.explicitWorkArrangement);
  const employmentType = detectEmploymentType(title, description, tags, job.explicitEmploymentType);
  const compensationStatus = detectCompensationStatus(salaryText, description);
  const countryScope = detectCountryScope(
    locationText,
    description,
    profile.locationCountry,
    profile.preferredLocations.map((l) => l.country),
  );

  const reject = (reason: string, matchedRoleTitle: string | null = null): EvaluatedJob => ({
    accepted: false,
    rejectionReason: reason,
    fingerprint,
    matchedRoleTitle,
    matchScore: 0,
    matchReasons: [],
    matchedSkills: [],
    missingSkills: [],
    countryScope,
    workArrangement,
    employmentType,
    compensationStatus,
    verificationStatus: 'discovered',
  });

  // 1. Reject US-citizenship-locked or no-sponsorship foreign roles when user is outside the US
  const homeCountries = [profile.locationCountry, ...profile.preferredLocations.map((l) => l.country)]
    .filter((c): c is string => Boolean(c && c.trim()))
    .map((c) => c.toLowerCase());
  const userOutsideUS = homeCountries.length > 0 && !homeCountries.some((c) => /united\s+states|\busa?\b/iu.test(c));
  const sponsorship = `${job.sponsorshipNote ?? ''} ${description.slice(0, 1200)}`;
  if (
    userOutsideUS
    && countryScope === 'international'
    && /\b(?:u\.?s\.?\s+citizenship\s+is\s+required|must\s+be\s+a\s+u\.?s\.?\s+citizen|does\s+not\s+offer\s+sponsorship|no\s+visa\s+sponsorship|security\s+clearance\s+required|itar\b)\b/iu.test(sponsorship)
  ) {
    return reject('Requires US citizenship or does not sponsor international applicants');
  }

  // 2. Reject non-software / hardware / battery / embedded / finance / PhD / Data-only roles when user targets Web/SWE tracks
  const userTargetsWebSwe = profile.preferredRoles.some((r) =>
    Boolean(r.category && ['frontend', 'backend', 'full_stack', 'software_engineering'].includes(r.category))
    || /\b(?:software|full[\s-]?stack|front[\s-]?end|back[\s-]?end|web|swe|sde)\b/iu.test(r.title),
  );
  const userTargetsData = profile.preferredRoles.some((r) => r.category === 'data' || /\b(?:data|ml|ai|machine\s+learning)\b/iu.test(r.title));
  if (userTargetsWebSwe && NON_WEB_SWE_NOISE_TITLE.test(title)) {
    const isDataAllowed = userTargetsData && /\b(?:data\s+science|data\s+engineering|data\s+analyst)\b/iu.test(title);
    if (!isDataAllowed) {
      return reject('Specialized non-web/non-SWE engineering or business role');
    }
  }

  // 3. STRICT INTERNSHIP GATE: If ALL active target roles are internships, ONLY accept actual internships
  const strictlyInternOnly = userStrictlyTargetsInternships(profile);
  if (strictlyInternOnly && employmentType !== 'internship') {
    return reject('Not an internship (all active target roles require internship seniority)');
  }

  // 4. Enforce Target Role track match
  const roleMatch = matchTargetRole(title, tags, profile.preferredRoles);
  if (!roleMatch.matchedTitle) {
    return reject('Does not match selected target roles');
  }

  // 5. Reject Senior/Lead roles or heavy-experience descriptions for early-career / internship profiles
  const targetSeniorities = new Set(profile.preferredRoles.map((r) => r.seniority));
  const onlyEarlyCareer =
    profile.preferredRoles.length > 0
    && [...targetSeniorities].every((s) => ['internship', 'entry_level', 'junior'].includes(s));

  if (onlyEarlyCareer || strictlyInternOnly) {
    if (SENIOR_TITLE_PATTERN.test(title) && !INTERN_TITLE_PATTERN.test(title)) {
      return reject('Seniority exceeds target internship/entry-level roles', roleMatch.matchedTitle);
    }
    if (HEAVY_EXPERIENCE_PATTERN.test(description) && !INTERN_TITLE_PATTERN.test(title)) {
      return reject('Requires 3+ years of prior experience', roleMatch.matchedTitle);
    }
  }

  // 6. Respect work arrangement hard constraint (remote_only rejects on-site; remote_preferred rejects foreign on-site if user is not willing to relocate)
  const prefWork = profile.preferences?.workArrangement ?? 'any';
  if (prefWork === 'remote_only' && workArrangement === 'onsite') {
    return reject('On-site role excluded by remote-only preference', roleMatch.matchedTitle);
  }
  if (
    countryScope === 'international'
    && workArrangement === 'onsite'
    && profile.preferences?.willingToRelocate === false
    && (prefWork === 'remote_preferred' || prefWork === 'remote_only')
  ) {
    return reject('Foreign on-site role excluded (not open to international relocation)', roleMatch.matchedTitle);
  }

  const reasons: string[] = [];
  let score = roleMatch.score;
  if (roleMatch.reason) reasons.push(roleMatch.reason);

  // Seniority bonus
  if (employmentType === 'internship' && (targetSeniorities.has('internship') || strictlyInternOnly)) {
    score += 16;
    reasons.push('Confirmed internship opportunity');
  } else if ((targetSeniorities.has('entry_level') || targetSeniorities.has('junior')) && (JUNIOR_PATTERN.test(title) || employmentType === 'internship')) {
    score += 10;
    reasons.push('Entry-level / junior friendly');
  }

  // Skill overlap against verified user skills
  const searchableBody = `${title}\n${tags.join(' ')}\n${description}`.toLowerCase();
  const matchedSkills: string[] = [];
  for (const skill of profile.skills) {
    const cleanSkill = skill.name.trim();
    if (!cleanSkill || cleanSkill.length < 2) continue;
    const escaped = cleanSkill.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const pattern = cleanSkill.length <= 3
      ? new RegExp(`(?:^|[\\s,(/|])${escaped}(?:$|[\\s,)/|;.])`, 'iu')
      : new RegExp(`\\b${escaped}\\b`, 'iu');
    if (pattern.test(searchableBody)) {
      matchedSkills.push(cleanSkill);
    }
  }

  if (matchedSkills.length > 0) {
    const skillPoints = Math.min(28, matchedSkills.length * 6);
    score += skillPoints;
    reasons.push(`Matches ${matchedSkills.length} verified skill${matchedSkills.length === 1 ? '' : 's'}: ${matchedSkills.slice(0, 5).join(', ')}`);
  }

  // Work arrangement preference alignment
  if (workArrangement === 'remote' && ['remote_only', 'remote_preferred', 'hybrid_or_remote'].includes(prefWork)) {
    score += 10;
    reasons.push('Remote work matches preference');
  } else if (workArrangement === 'hybrid' && ['hybrid_or_remote', 'any'].includes(prefWork)) {
    score += 6;
    reasons.push('Hybrid work accepted');
  }

  // Location / scope bonus
  if (countryScope === 'national') {
    score += 10;
    reasons.push('Matches preferred country/region');
  } else if (countryScope === 'remote_global') {
    score += 8;
    reasons.push('Open globally / remote-friendly');
  }

  // Compensation preference
  const paidPref = profile.preferences?.paidPreference ?? 'paid_preferred';
  if (compensationStatus === 'paid') {
    score += 6;
    reasons.push(salaryText ? `Paid (${salaryText.slice(0, 40)})` : 'Paid opportunity');
  } else if (compensationStatus === 'unpaid' && paidPref === 'paid_only') {
    return reject('Unpaid role excluded by paid-only preference', roleMatch.matchedTitle);
  } else if (compensationStatus === 'unpaid') {
    score -= 10;
    reasons.push('Unpaid role (flagged clearly)');
  }

  // Recency bonus
  if (job.postedAt) {
    const ageDays = (Date.now() - job.postedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays <= 3) {
      score += 6;
      reasons.push('Posted within last 72 hours');
    } else if (ageDays <= 14) {
      score += 3;
      reasons.push('Posted within last 2 weeks');
    }
  }

  const finalScore = Math.max(10, Math.min(100, Math.round(score)));
  const verificationStatus = ['greenhouse', 'lever', 'ashby', 'simplify_internships', 'remotive', 'remotefirstjobs', 'arbeitnow', 'jobicy'].includes(job.sourceName)
    ? 'verified_active'
    : 'discovered';

  return {
    accepted: true,
    rejectionReason: null,
    fingerprint,
    matchedRoleTitle: roleMatch.matchedTitle,
    matchScore: finalScore,
    matchReasons: reasons,
    matchedSkills: matchedSkills.slice(0, 12),
    missingSkills: [],
    countryScope,
    workArrangement,
    employmentType,
    compensationStatus,
    verificationStatus,
  };
}

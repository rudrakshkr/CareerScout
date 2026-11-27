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

const NON_WEB_SWE_NOISE_TITLE = /\b(?:sales|account\s+executive|business\s+development|marketing|recruiter|talent\s+acquisition|human\s+resources|customer\s+support|customer\s+success|copywriter|graphic\s+designer|nurse|pharmacist|lawyer|counsel|finance|accountant|payroll|annuities|insurance|underwriting|actuarial|supply\s+chain|warehouse|battery|mechanical|civil|electrical|hardware|firmware|embedded|automotive|vehicle|adas|infotainment|aerospace|avionics|manufacturing|simulation|rack\/cluster|silicon|asic|fpga|vlsi|rf\s+engineer|chemical|biotech|clinical|quantum|cheminformatics|accounting|audit|tax|masters?\s+only|ph\.?d\.?\s+(?:intern|research)|research\s+intern|data\s+science|data\s+engineering|data\s+analyst|security\s+clearance|ts\/sci)\b/iu;

const US_STATE_ABBR = /\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/u;

const FOREIGN_ONLY_REMOTE_PATTERN = /\b(?:remote\s*(?:in|only\s+in|-|–|\(|,)\s*(?:the\s+)?(?:u\.?s\.?a?\.?|united\s+states|canada|uk|u\.?k\.?|united\s+kingdom|europe|eu\b|emea|latam|north\s+america|germany|france|spain|netherlands|australia|singapore|japan|ireland|poland|brazil|mexico|switzerland|sweden)|(?:u\.?s\.?a?|canada|uk|eu|europe|emea|latam|north\s+america)\s+(?:only\s+)?remote|(?:u\.?s\.?a?|united\s+states|canada|uk|eu|europe|emea|latam|north\s+america)\s+(?:residents?|candidates?|only)\b|must\s+(?:reside|live|be\s+(?:based|located))\s+in\s+(?:the\s+)?(?:u\.?s\.?a?|united\s+states|canada|uk|united\s+kingdom|europe|eu\b|emea|north\s+america)|work\s+from\s+(?:anywhere\s+in\s+)?(?:the\s+)?(?:u\.?s\.?a?|united\s+states|canada|uk|eu|europe)\s+only)\b/iu;

const INDIA_OR_GLOBAL_REMOTE_PATTERN = /\b(?:worldwide|global(?:ly)?|anywhere(?:\s+in\s+the\s+world)?|all\s+regions|apac|asia[\s-]?pacific|india)\b/iu;

const NO_SPONSORSHIP_PATTERN = /\b(?:u\.?s\.?\s+citizenship\s+is\s+required|must\s+be\s+a\s+u\.?s\.?\s+citizen|does\s+not\s+offer\s+(?:visa\s+)?sponsorship|no\s+(?:visa\s+)?sponsorship|unable\s+to\s+sponsor|cannot\s+sponsor|will\s+not\s+sponsor|without\s+(?:the\s+need\s+for\s+)?(?:visa\s+)?sponsorship|not\s+eligible\s+for\s+(?:visa\s+)?sponsorship|security\s+clearance\s+required|itar\b|must\s+(?:already\s+)?have\s+(?:the\s+)?right\s+to\s+work)\b/iu;

const NO_RELOCATION_PATTERN = /\b(?:no\s+(?:international\s+)?relocation(?:\s+(?:support|assistance|package|allowance|offered|provided|available))?|relocation\s+(?:support|assistance|package|allowance)?\s*(?:is\s+)?not\s+(?:offered|provided|available|included|supported)|(?:do|does|will|can)\s*not\s+(?:offer|provide|cover|support)\s+(?:international\s+)?relocation|cannot\s+(?:offer|provide|cover|support)\s+(?:international\s+)?relocation|without\s+relocation|domestic\s+relocation\s+only|relocation\s+(?:only\s+)?within\s+(?:the\s+)?(?:u\.?s\.?a?|united\s+states|canada|uk|eu|europe)|local\s+candidates\s+only|must\s+(?:already\s+)?(?:reside|live|be\s+(?:located|based))\s+(?:in|within\s+commuting\s+distance))\b/iu;

const POSITIVE_RELOCATION_PATTERN = /\b(?:relocation\s+(?:support|assistance|package|allowance|bonus|stipend|provided|offered|available|included|reimbursement|benefits?|covered|budget|grant)|(?:full|international|global|paid)\s+relocation|(?:offer|offers|offering|provide|provides|providing|cover|covers|covering|include|includes|including|assist|assists|assisting|help|helps|helping|support|supports|supporting)\s+(?:with\s+)?(?:full\s+|international\s+)?relocation|visa\s+(?:and|&|\/)\s+relocation|relocation\s+(?:and|&|\/)\s+visa|relocation\s+to\s+[a-z]{3,})\b/iu;

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
  if (/\b(?:fully\s+remote|100%\s+remote|remote[\s-]?first|work\s+from\s+home|wfh\s+supported)\b/iu.test(snippet)) return 'remote';
  if (/\bhybrid\b/iu.test(snippet)) return 'hybrid';
  if (/\b(?:on[\s-]?site|in[\s-]?office)\b/iu.test(snippet)) return 'onsite';
  if (
    location.trim().length >= 3
    && (location.includes(',') || US_STATE_ABBR.test(location) || /\b(?:nyc|sf|london|paris|berlin|dublin|amsterdam|singapore|tokyo|toronto|sydney|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|chennai|noida|gurgaon|gurugram)\b/iu.test(location))
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

  // Country/region-locked remote (e.g. "Remote in USA", "Remote - Europe", "US Remote") -> international (not global WFH)
  if (FOREIGN_ONLY_REMOTE_PATTERN.test(loc) && !INDIA_OR_GLOBAL_REMOTE_PATTERN.test(loc)) {
    return 'international';
  }

  // Truly global / APAC / Worldwide remote
  if (
    /\b(?:worldwide|global(?:ly)?|anywhere|all\s+regions|remote\s*[-–·]\s*global|apac|asia[\s-]?pacific)\b/iu.test(loc)
    || (/^remote(?:\s*\(?(?:flexible|wfh|work\s+from\s+home)\)?)?$/iu.test(loc) && !FOREIGN_ONLY_REMOTE_PATTERN.test(description.slice(0, 1400)))
  ) {
    return 'remote_global';
  }

  if (loc.length >= 2) {
    return 'international';
  }

  if (/\b(?:worldwide|global(?:ly)?|work\s+from\s+anywhere)\b/iu.test(description.slice(0, 800)) && !FOREIGN_ONLY_REMOTE_PATTERN.test(description.slice(0, 1400))) {
    return 'remote_global';
  }

  return 'unknown';
}

export function evaluateInternationalEligibility(options: {
  locationText: string;
  description: string;
  sponsorshipNote?: string | null;
  countryScope: CountryScope;
  workArrangement: JobWorkArrangement;
  homeCountries: string[];
}): { allowed: boolean; reason: string | null; rejectionReason: string | null; bonus: number } {
  const { locationText, description, sponsorshipNote, countryScope, workArrangement, homeCountries } = options;

  // National roles inside the user's home country are always eligible
  if (countryScope === 'national') {
    return { allowed: true, reason: 'Matches preferred country/region', rejectionReason: null, bonus: 10 };
  }

  const combinedText = `${locationText}\n${sponsorshipNote ?? ''}\n${description.slice(0, 2600)}`;
  const homeCountryMentioned = homeCountries.some((country) => {
    const escaped = country.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'iu').test(combinedText);
  });

  const hasForeignRemoteLock =
    FOREIGN_ONLY_REMOTE_PATTERN.test(combinedText)
    && !homeCountryMentioned
    && !/\b(?:worldwide|anywhere\s+in\s+the\s+world|all\s+regions|apac|asia[\s-]?pacific)\b/iu.test(locationText);

  const hasNoSponsorship = NO_SPONSORSHIP_PATTERN.test(combinedText);
  const hasNoRelocation = NO_RELOCATION_PATTERN.test(combinedText);
  const hasRelocationSupport = POSITIVE_RELOCATION_PATTERN.test(combinedText) && !hasNoRelocation;

  // Case 1: Global Remote / WFH supported from home country
  if (countryScope === 'remote_global' && workArrangement === 'remote') {
    if (hasForeignRemoteLock) {
      return {
        allowed: false,
        reason: null,
        rejectionReason: 'Remote role is restricted to foreign countries/regions (not WFH from home country)',
        bonus: 0,
      };
    }
    return {
      allowed: true,
      reason: 'Remote / WFH supported internationally from India',
      rejectionReason: null,
      bonus: 10,
    };
  }

  // Case 2: International role (outside home country)
  if (countryScope === 'international') {
    // Subcase 2a: International Remote — ONLY allowed if WFH from home country is actually supported OR relocation is explicitly provided
    if (workArrangement === 'remote') {
      const wfhSupportedFromHome = !hasForeignRemoteLock && (homeCountryMentioned || INDIA_OR_GLOBAL_REMOTE_PATTERN.test(locationText));
      if (wfhSupportedFromHome) {
        return {
          allowed: true,
          reason: 'International remote / WFH supported from India',
          rejectionReason: null,
          bonus: 10,
        };
      }
      if (hasRelocationSupport && !hasNoSponsorship) {
        return {
          allowed: true,
          reason: 'International role with explicit relocation support',
          rejectionReason: null,
          bonus: 8,
        };
      }
      return {
        allowed: false,
        reason: null,
        rejectionReason: 'Country-locked foreign remote role (WFH from India not supported and no relocation offered)',
        bonus: 0,
      };
    }

    // Subcase 2b: International On-site / Hybrid / Unspecified mode — MUST explicitly offer relocation support and not block sponsorship
    if (hasNoSponsorship) {
      return {
        allowed: false,
        reason: null,
        rejectionReason: 'International role does not offer visa sponsorship or requires local citizenship',
        bonus: 0,
      };
    }
    if (hasRelocationSupport) {
      return {
        allowed: true,
        reason: 'International on-site/hybrid role with explicit relocation support',
        rejectionReason: null,
        bonus: 8,
      };
    }
    return {
      allowed: false,
      reason: null,
      rejectionReason: 'International on-site/hybrid role does not specify relocation support from India',
      bonus: 0,
    };
  }

  // Case 3: Unknown geography — allow only if Remote/WFH (without foreign lock) or explicit relocation support
  if (workArrangement === 'remote' && !hasForeignRemoteLock) {
    return {
      allowed: true,
      reason: 'Remote / WFH supported',
      rejectionReason: null,
      bonus: 6,
    };
  }
  if (hasRelocationSupport && !hasNoSponsorship) {
    return {
      allowed: true,
      reason: 'Relocation support explicitly offered',
      rejectionReason: null,
      bonus: 6,
    };
  }

  return {
    allowed: false,
    reason: null,
    rejectionReason: 'Location unspecified with neither WFH nor relocation support confirmed',
    bonus: 0,
  };
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

    if (normalizedJob.includes(targetLower) || targetLower.includes(normalizedJob)) {
      const candidate = { matchedTitle: role.title, score: 44, reason: `Direct title match for “${role.title}”` };
      if (!bestMatch || candidate.score > bestMatch.score) bestMatch = candidate;
      continue;
    }

    const categoryHit = Boolean(targetCategory && jobCategory && (
      targetCategory === jobCategory
      || (targetCategory === 'software_engineering' && ['full_stack', 'frontend', 'backend'].includes(jobCategory))
      || (['full_stack', 'frontend', 'backend'].includes(targetCategory) && jobCategory === 'software_engineering')
    ));

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

  const homeCountries = Array.from(
    new Set(
      [profile.locationCountry, ...profile.preferredLocations.map((l) => l.country)]
        .filter((c): c is string => Boolean(c && c.trim()))
        .map((c) => c.trim().toLowerCase()),
    ),
  );

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

  // 1. Reject non-software / hardware / battery / embedded / finance / PhD / Data-only roles when targeting Web/SWE
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

  // 2. STRICT INTERNSHIP GATE: If ALL active target roles are internships, ONLY accept actual internships
  const strictlyInternOnly = userStrictlyTargetsInternships(profile);
  if (strictlyInternOnly && employmentType !== 'internship') {
    return reject('Not an internship (all active target roles require internship seniority)');
  }

  // 3. Enforce Target Role track match
  const roleMatch = matchTargetRole(title, tags, profile.preferredRoles);
  if (!roleMatch.matchedTitle) {
    return reject('Does not match selected target roles');
  }

  // 4. Reject Senior/Lead roles or heavy-experience descriptions for early-career / internship profiles
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

  // 5. INTERNATIONAL ELIGIBILITY GATE:
  // Non-national jobs MUST either support WFH/remote from India OR explicitly provide relocation support (without sponsorship blocks)
  const intlCheck = evaluateInternationalEligibility({
    locationText,
    description,
    sponsorshipNote: job.sponsorshipNote,
    countryScope,
    workArrangement,
    homeCountries: homeCountries.length > 0 ? homeCountries : ['india'],
  });
  if (!intlCheck.allowed) {
    return reject(intlCheck.rejectionReason || 'International role not eligible', roleMatch.matchedTitle);
  }

  // 6. Respect national remote-only preference
  const prefWork = profile.preferences?.workArrangement ?? 'any';
  if (prefWork === 'remote_only' && countryScope === 'national' && workArrangement === 'onsite') {
    return reject('On-site role excluded by remote-only preference', roleMatch.matchedTitle);
  }

  const reasons: string[] = [];
  let score = roleMatch.score;
  if (roleMatch.reason) reasons.push(roleMatch.reason);
  if (intlCheck.reason) {
    score += intlCheck.bonus;
    reasons.push(intlCheck.reason);
  }

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
    score += 8;
    reasons.push('Remote / WFH matches preference');
  } else if (workArrangement === 'hybrid' && ['hybrid_or_remote', 'any'].includes(prefWork)) {
    score += 4;
    reasons.push('Hybrid work accepted');
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

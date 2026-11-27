import type { JobEmploymentType, JobWorkArrangement, RawDiscoveredJob } from './types.js';

const USER_AGENT = 'CareerScout-Local/0.7 (local-first personal job assistant)';

function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr)>/giu, '\n')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

export function unwrapRedirectUrlSync(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('google.')) {
      for (const key of ['q', 'url', 'u']) {
        const candidate = parsed.searchParams.get(key);
        if (candidate && /^https?:\/\//iu.test(candidate)) {
          return candidate;
        }
      }
    }
    return parsed.href;
  } catch {
    return trimmed;
  }
}

export async function resolveRedirectUrl(rawUrl: string): Promise<string> {
  const syncUnwrapped = unwrapRedirectUrlSync(rawUrl);
  try {
    const parsed = new URL(syncUnwrapped);
    if (!/google\.[a-z.]+\/(?:goto|url)/iu.test(parsed.href)) {
      return parsed.href;
    }
    const res = await fetch(parsed.href, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    const loc = res.headers.get('location');
    if (loc && /^https?:\/\//iu.test(loc) && !/google\.[a-z.]+\/(?:goto|url)/iu.test(loc)) {
      return loc;
    }
  } catch {
    // Keep original if redirect probe fails
  }
  return syncUnwrapped;
}

async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T | null> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export interface FirecrawlSearchHit {
  url: string;
  title: string;
  description?: string;
  markdown?: string;
}

export async function firecrawlWebSearch(options: {
  apiKey: string;
  query: string;
  limit?: number;
  tbs?: 'qdr:d' | 'qdr:w' | 'qdr:m';
  includeDomains?: string[];
  excludeDomains?: string[];
}): Promise<{ ok: boolean; hits: FirecrawlSearchHit[]; error: string | null }> {
  const key = options.apiKey.trim();
  if (!key) return { ok: false, hits: [], error: 'Firecrawl API key is not configured.' };

  const body: Record<string, unknown> = {
    query: options.query.slice(0, 490),
    limit: options.limit ?? 8,
  };
  if (options.tbs) body.tbs = options.tbs;
  if (options.includeDomains?.length) body.includeDomains = options.includeDomains;
  if (options.excludeDomains?.length) body.excludeDomains = options.excludeDomains;

  for (const endpoint of ['https://api.firecrawl.dev/v2/search', 'https://api.firecrawl.dev/v1/search']) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25_000),
      });

      if (response.status === 401 || response.status === 403) {
        return { ok: false, hits: [], error: 'Firecrawl rejected the API key (HTTP 401/403).' };
      }
      if (response.status === 402 || response.status === 429) {
        return { ok: false, hits: [], error: 'Firecrawl credit limit or rate limit reached (HTTP 402/429).' };
      }
      if (!response.ok) continue;

      const payload = (await response.json()) as {
        success?: boolean;
        data?: FirecrawlSearchHit[] | { web?: FirecrawlSearchHit[] };
      };

      const rawList = Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.data?.web)
          ? payload.data.web
          : [];

      const hits = rawList
        .filter((item): item is FirecrawlSearchHit => Boolean(item?.url && item?.title))
        .map((item) => ({ ...item, url: unwrapRedirectUrlSync(item.url) }));

      return { ok: true, hits, error: null };
    } catch {
      // Try fallback endpoint
    }
  }
  return { ok: false, hits: [], error: 'Could not reach Firecrawl search API.' };
}

export async function fetchRemoteFirstJobs(internOnly = false): Promise<RawDiscoveredJob[]> {
  type RemoteFirstJob = {
    id?: string;
    url?: string;
    company_name?: string;
    title?: string;
    category?: string;
    seniority?: string;
    description?: string;
    salary_min?: number | null;
    salary_max?: number | null;
    locations?: string[];
    published_at?: string;
  };
  type RemoteFirstResponse = { jobs?: RemoteFirstJob[] };

  const queries = internOnly
    ? ['query=intern&category=software-development', 'query=internship&category=software-development']
    : ['category=software-development&page=0'];

  const jobs: RawDiscoveredJob[] = [];
  const seen = new Set<string>();

  for (const qs of queries) {
    const payload = await fetchJson<RemoteFirstResponse>(`https://remotefirstjobs.com/api/search-jobs?${qs}`, {}, 15_000);
    for (const item of payload?.jobs ?? []) {
      if (!item.url || !item.title || !item.company_name || seen.has(item.url)) continue;
      seen.add(item.url);
      const loc = Array.isArray(item.locations) && item.locations.length > 0
        ? `Remote (${item.locations.join(', ')})`
        : 'Remote (Worldwide)';
      const salary = item.salary_min || item.salary_max
        ? `$${item.salary_min ?? ''}${item.salary_max ? `-$${item.salary_max}` : ''}`.trim()
        : null;
      const postedAt = item.published_at ? new Date(item.published_at) : null;
      const isIntern = /intern/iu.test(`${item.title} ${item.seniority ?? ''}`);

      jobs.push({
        sourceName: 'remotefirstjobs',
        sourceUrl: item.url,
        applyUrl: item.url,
        title: item.title.trim(),
        companyName: item.company_name.trim(),
        locationText: loc,
        salaryText: salary,
        description: stripHtml(item.description).slice(0, 5000),
        postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
        tags: [item.category, item.seniority].filter((t): t is string => Boolean(t)),
        explicitWorkArrangement: 'remote',
        explicitEmploymentType: isIntern ? 'internship' : null,
      });
    }
  }
  return jobs;
}

export async function fetchSimplifyInternships(): Promise<RawDiscoveredJob[]> {
  const urls = [
    'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json',
    'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/main/.github/scripts/listings.json',
  ];

  type SimplifyListing = {
    company_name?: string;
    title?: string;
    locations?: string[];
    url?: string;
    active?: boolean;
    is_visible?: boolean;
    date_posted?: number;
    date_updated?: number;
    terms?: string[];
    category?: string;
    sponsorship?: string;
  };

  let items: SimplifyListing[] | null = null;
  for (const url of urls) {
    const res = await fetchJson<SimplifyListing[]>(url, {}, 18_000);
    if (Array.isArray(res) && res.length > 0) {
      items = res;
      break;
    }
  }
  if (!items) return [];

  return items
    .filter((item) => item.active !== false && item.is_visible !== false && Boolean(item.url && item.title && item.company_name))
    .sort((a, b) => (b.date_posted ?? b.date_updated ?? 0) - (a.date_posted ?? a.date_updated ?? 0))
    .slice(0, 220)
    .map((item) => {
      const ts = item.date_posted ?? item.date_updated;
      const postedAt = typeof ts === 'number' ? new Date(ts > 1e12 ? ts : ts * 1000) : null;
      const loc = Array.isArray(item.locations) ? item.locations.join(' | ') : null;
      const terms = Array.isArray(item.terms) ? item.terms.join(', ') : '';
      return {
        sourceName: 'simplify_internships',
        sourceUrl: item.url!,
        applyUrl: item.url!,
        title: item.title!.trim(),
        companyName: item.company_name!.trim(),
        locationText: loc || null,
        sponsorshipNote: item.sponsorship ?? null,
        description: [
          terms ? `Internship term: ${terms}.` : null,
          item.category ? `Category: ${item.category}.` : null,
          item.sponsorship ? `Sponsorship: ${item.sponsorship}.` : null,
          loc ? `Locations: ${loc}.` : null,
          'Active tech internship tracked via SimplifyJobs public repository.',
        ].filter(Boolean).join(' '),
        postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
        tags: ['internship', ...(item.terms ?? []), ...(item.category ? [item.category] : [])],
        explicitEmploymentType: 'internship' as JobEmploymentType,
      };
    });
}

export async function fetchRemotiveJobs(searchTerms: string[], internOnly = false): Promise<RawDiscoveredJob[]> {
  const jobs: RawDiscoveredJob[] = [];
  const seen = new Set<string>();
  const queries = internOnly
    ? ['intern', 'internship', ...searchTerms.slice(0, 2)]
    : Array.from(new Set(['software-dev', ...searchTerms.slice(0, 3)]));

  for (const term of queries) {
    const url = term === 'software-dev'
      ? 'https://remotive.com/api/remote-jobs?category=software-dev&limit=80'
      : `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(term)}&limit=50`;
    const payload = await fetchJson<{
      jobs?: Array<{
        id: number;
        url: string;
        title: string;
        company_name: string;
        candidate_required_location?: string;
        salary?: string;
        publication_date?: string;
        description?: string;
        tags?: string[];
      }>;
    }>(url);

    for (const item of payload?.jobs ?? []) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      const postedAt = item.publication_date ? new Date(item.publication_date) : null;
      jobs.push({
        sourceName: 'remotive',
        sourceUrl: item.url,
        applyUrl: item.url,
        title: item.title,
        companyName: item.company_name,
        locationText: item.candidate_required_location || 'Remote',
        salaryText: item.salary || null,
        description: stripHtml(item.description).slice(0, 5000),
        postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
        tags: item.tags ?? [],
        explicitWorkArrangement: 'remote',
      });
    }
  }
  return jobs;
}

export async function fetchArbeitnowJobs(): Promise<RawDiscoveredJob[]> {
  const jobs: RawDiscoveredJob[] = [];
  for (let page = 1; page <= 2; page += 1) {
    const payload = await fetchJson<{
      data?: Array<{
        slug: string;
        company_name: string;
        title: string;
        description: string;
        remote: boolean;
        url: string;
        tags?: string[];
        location?: string;
        created_at?: number;
      }>;
    }>(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);

    for (const item of payload?.data ?? []) {
      if (!item.url || !item.title || !item.company_name) continue;
      const postedAt = typeof item.created_at === 'number' ? new Date(item.created_at * 1000) : null;
      jobs.push({
        sourceName: 'arbeitnow',
        sourceUrl: item.url,
        applyUrl: item.url,
        title: item.title,
        companyName: item.company_name,
        locationText: item.remote ? `${item.location || 'Europe / Remote'} (Remote)` : item.location || null,
        description: stripHtml(item.description).slice(0, 5000),
        postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
        tags: item.tags ?? [],
        explicitWorkArrangement: item.remote ? 'remote' : null,
      });
    }
  }
  return jobs;
}

export async function fetchJobicyJobs(): Promise<RawDiscoveredJob[]> {
  const payload = await fetchJson<{
    jobs?: Array<{
      id: number;
      url: string;
      jobTitle: string;
      companyName: string;
      jobGeo?: string;
      jobType?: string[];
      annualSalaryMin?: string | number;
      annualSalaryMax?: string | number;
      salaryCurrency?: string;
      pubDate?: string;
      jobExcerpt?: string;
      jobDescription?: string;
    }>;
  }>('https://jobicy.com/api/v2/remote-jobs?count=50&industry=dev');

  return (payload?.jobs ?? [])
    .filter((item) => Boolean(item.url && item.jobTitle && item.companyName))
    .map((item) => {
      const salary = item.annualSalaryMin || item.annualSalaryMax
        ? `${item.salaryCurrency ?? ''} ${item.annualSalaryMin ?? ''}${item.annualSalaryMax ? `-${item.annualSalaryMax}` : ''} / yr`.trim()
        : null;
      const postedAt = item.pubDate ? new Date(item.pubDate) : null;
      return {
        sourceName: 'jobicy',
        sourceUrl: item.url,
        applyUrl: item.url,
        title: item.jobTitle,
        companyName: item.companyName,
        locationText: item.jobGeo ? `${item.jobGeo} (Remote)` : 'Remote',
        salaryText: salary,
        description: stripHtml(item.jobDescription || item.jobExcerpt).slice(0, 5000),
        postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
        tags: item.jobType ?? [],
        explicitWorkArrangement: 'remote' as JobWorkArrangement,
      };
    });
}

function parseHnHiringComment(commentText: string, objectId: string, author: string, createdAt: string | null): RawDiscoveredJob | null {
  const text = stripHtml(commentText);
  if (text.length < 40) return null;
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  if (!firstLine.includes('|')) return null;

  const parts = firstLine.split('|').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const companyName = parts[0].replace(/\(https?:\/\/[^)]+\)/giu, '').trim().slice(0, 80);
  const titlePart = parts.find((p, i) => i > 0 && /\b(?:engineer|developer|intern|full[\s-]?stack|front[\s-]?end|back[\s-]?end|swe|sde|software|founding)\b/iu.test(p))
    ?? parts[1];
  const locationPart = parts.find((p, i) => i > 0 && p !== titlePart && /\b(?:remote|hybrid|onsite|on-site|india|usa|us|uk|eu|europe|worldwide|global|sf|nyc|london|berlin|bangalore|delhi)\b/iu.test(p))
    ?? parts[2]
    ?? 'Remote / See post';

  if (!companyName || !titlePart || companyName.length < 2) return null;

  const urlMatch = text.match(/https?:\/\/[^\s<>)"']+/iu);
  const emailMatch = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u);
  const sourceUrl = `https://news.ycombinator.com/item?id=${objectId}`;
  const postedAt = createdAt ? new Date(createdAt) : null;

  return {
    sourceName: 'hn_hiring',
    sourceUrl,
    applyUrl: urlMatch?.[0] ?? sourceUrl,
    title: titlePart.slice(0, 120),
    companyName,
    companyWebsite: urlMatch?.[0] ?? null,
    locationText: locationPart.slice(0, 100),
    description: text.slice(0, 5000),
    postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
    rawContactHint: {
      name: author ? `${author} (HN Poster)` : null,
      email: emailMatch?.[0] ?? null,
      roleTitle: 'Hiring Team / Poster on Hacker News',
      profileUrl: author ? `https://news.ycombinator.com/user?id=${encodeURIComponent(author)}` : null,
      note: emailMatch?.[0]
        ? `Publicly shared contact email in Hacker News Who is Hiring thread (${sourceUrl}).`
        : `Posted directly by ${author || 'company member'} in Hacker News Who is Hiring thread.`,
    },
  };
}

export async function fetchHackerNewsHiringJobs(): Promise<RawDiscoveredJob[]> {
  const threads = await fetchJson<{
    hits?: Array<{ objectID: string; title: string }>;
  }>('https://hn.algolia.com/api/v1/search_by_date?query=%22Ask%20HN%3A%20Who%20is%20hiring%22&tags=story,author_whoishiring&hitsPerPage=2');

  const latestThreadId = threads?.hits?.[0]?.objectID;
  if (!latestThreadId) return [];

  const comments = await fetchJson<{
    hits?: Array<{ objectID: string; author?: string; comment_text?: string; created_at?: string; parent_id?: number }>;
  }>(`https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${latestThreadId}&hitsPerPage=140`);

  const jobs: RawDiscoveredJob[] = [];
  for (const hit of comments?.hits ?? []) {
    if (!hit.comment_text || String(hit.parent_id) !== String(latestThreadId)) continue;
    const parsed = parseHnHiringComment(hit.comment_text, hit.objectID, hit.author ?? '', hit.created_at ?? null);
    if (parsed) jobs.push(parsed);
  }
  return jobs;
}

// Prioritized India-hiring & Global-Remote ATS boards first so both Quick and Overnight runs hit eligible roles fast
export const CURATED_ATS_BOARDS: Array<{ provider: 'greenhouse' | 'lever' | 'ashby'; token: string; companyName: string }> = [
  // Strong India engineering hubs & India-remote startups
  { provider: 'greenhouse', token: 'razorpaysoftwareprivatelimited', companyName: 'Razorpay' },
  { provider: 'greenhouse', token: 'postman', companyName: 'Postman' },
  { provider: 'greenhouse', token: 'browserstack', companyName: 'BrowserStack' },
  { provider: 'greenhouse', token: 'phonepe', companyName: 'PhonePe' },
  { provider: 'greenhouse', token: 'groww', companyName: 'Groww' },
  { provider: 'greenhouse', token: 'swiggy', companyName: 'Swiggy' },
  { provider: 'greenhouse', token: 'chargebee', companyName: 'Chargebee' },
  { provider: 'greenhouse', token: 'freshworks', companyName: 'Freshworks' },
  { provider: 'greenhouse', token: 'rubrik', companyName: 'Rubrik' },
  { provider: 'greenhouse', token: 'cohesity', companyName: 'Cohesity' },
  { provider: 'greenhouse', token: 'harness', companyName: 'Harness' },
  { provider: 'greenhouse', token: 'hasura', companyName: 'Hasura' },
  { provider: 'greenhouse', token: 'sprinklr', companyName: 'Sprinklr' },
  { provider: 'greenhouse', token: 'nutanix', companyName: 'Nutanix' },
  { provider: 'greenhouse', token: 'twilio', companyName: 'Twilio' },
  { provider: 'greenhouse', token: 'atlassian', companyName: 'Atlassian' },
  { provider: 'lever', token: 'meesho', companyName: 'Meesho' },
  { provider: 'lever', token: 'cred', companyName: 'CRED' },
  { provider: 'lever', token: 'paytm', companyName: 'Paytm' },
  { provider: 'lever', token: 'dream11', companyName: 'Dream11' },
  { provider: 'ashby', token: 'deel', companyName: 'Deel' },
  { provider: 'ashby', token: 'posthog', companyName: 'PostHog' },
  { provider: 'ashby', token: 'supabase', companyName: 'Supabase' },
  { provider: 'ashby', token: 'replit', companyName: 'Replit' },
  // Global remote-friendly & international relocation companies
  { provider: 'greenhouse', token: 'gitlab', companyName: 'GitLab' },
  { provider: 'greenhouse', token: 'vercel', companyName: 'Vercel' },
  { provider: 'greenhouse', token: 'cloudflare', companyName: 'Cloudflare' },
  { provider: 'greenhouse', token: 'stripe', companyName: 'Stripe' },
  { provider: 'greenhouse', token: 'mongodb', companyName: 'MongoDB' },
  { provider: 'greenhouse', token: 'datadog', companyName: 'Datadog' },
  { provider: 'greenhouse', token: 'grafanalabs', companyName: 'Grafana Labs' },
  { provider: 'greenhouse', token: 'sentry', companyName: 'Sentry' },
  { provider: 'greenhouse', token: 'remotecom', companyName: 'Remote' },
  { provider: 'greenhouse', token: 'canonical', companyName: 'Canonical' },
  { provider: 'greenhouse', token: 'elastic', companyName: 'Elastic' },
  { provider: 'greenhouse', token: 'zscaler', companyName: 'Zscaler' },
  { provider: 'greenhouse', token: 'okta', companyName: 'Okta' },
  { provider: 'greenhouse', token: 'coinbase', companyName: 'Coinbase' },
  { provider: 'greenhouse', token: 'dropbox', companyName: 'Dropbox' },
  { provider: 'greenhouse', token: 'figma', companyName: 'Figma' },
  { provider: 'greenhouse', token: 'airbnb', companyName: 'Airbnb' },
  { provider: 'ashby', token: 'notion', companyName: 'Notion' },
  { provider: 'ashby', token: 'linear', companyName: 'Linear' },
  { provider: 'ashby', token: 'airwallex', companyName: 'Airwallex' },
  { provider: 'ashby', token: 'perplexity', companyName: 'Perplexity' },
  { provider: 'ashby', token: 'ramp', companyName: 'Ramp' },
  { provider: 'ashby', token: 'vanta', companyName: 'Vanta' },
  { provider: 'lever', token: 'spotify', companyName: 'Spotify' },
  { provider: 'lever', token: 'plaid', companyName: 'Plaid' },
];

export async function fetchAshbyBoard(token: string, companyName: string): Promise<RawDiscoveredJob[]> {
  const payload = await fetchJson<{
    jobs?: Array<{
      id: string;
      title: string;
      location?: string;
      secondaryLocations?: Array<{ location?: string }>;
      isRemote?: boolean;
      workplaceType?: string;
      employmentType?: string;
      isListed?: boolean;
      publishedAt?: string;
      jobUrl?: string;
      applyUrl?: string;
      descriptionPlain?: string;
      department?: string;
      team?: string;
      compensation?: {
        summaryComponents?: Array<{
          minValue?: number;
          maxValue?: number;
          currencyCode?: string;
          interval?: string;
        }>;
      };
    }>;
  }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`);

  return (payload?.jobs ?? [])
    .filter((item) => item.isListed !== false && Boolean(item.title && (item.jobUrl || item.applyUrl)))
    .slice(0, 120)
    .map((item) => {
      const locations = [item.location, ...(item.secondaryLocations ?? []).map((s) => s.location)].filter(Boolean);
      const comp = item.compensation?.summaryComponents?.[0];
      const salaryText = comp && (comp.minValue || comp.maxValue)
        ? `${comp.currencyCode ?? ''} ${comp.minValue ?? ''}${comp.maxValue ? `-${comp.maxValue}` : ''} ${comp.interval ?? ''}`.trim()
        : null;
      const wp = item.workplaceType?.toLowerCase();
      const explicitWorkArrangement: JobWorkArrangement | null =
        wp === 'remote' || item.isRemote ? 'remote' : wp === 'hybrid' ? 'hybrid' : wp === 'onsite' ? 'onsite' : null;
      const emp = item.employmentType?.toLowerCase();
      const explicitEmploymentType: JobEmploymentType | null =
        emp === 'intern' ? 'internship' : emp === 'fulltime' ? 'full_time' : emp === 'parttime' ? 'part_time' : emp === 'contract' ? 'contract' : null;
      const postedAt = item.publishedAt ? new Date(item.publishedAt) : null;

      return {
        sourceName: 'ashby',
        sourceUrl: item.jobUrl || item.applyUrl!,
        applyUrl: item.applyUrl || item.jobUrl!,
        title: item.title.trim(),
        companyName,
        careersUrl: `https://jobs.ashbyhq.com/${token}`,
        atsProvider: 'ashby',
        atsBoardToken: token,
        locationText: locations.join(' | ') || null,
        salaryText,
        description: (item.descriptionPlain ?? '').slice(0, 5000),
        postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
        tags: [item.department, item.team, item.employmentType].filter((t): t is string => Boolean(t)),
        explicitWorkArrangement,
        explicitEmploymentType,
      };
    });
}

export async function fetchGreenhouseBoard(token: string, companyName: string): Promise<RawDiscoveredJob[]> {
  const payload = await fetchJson<{
    jobs?: Array<{
      id: number;
      title: string;
      absolute_url: string;
      updated_at?: string;
      location?: { name?: string };
      content?: string;
    }>;
  }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`);

  return (payload?.jobs ?? []).slice(0, 120).map((item) => {
    const postedAt = item.updated_at ? new Date(item.updated_at) : null;
    return {
      sourceName: 'greenhouse',
      sourceUrl: item.absolute_url,
      applyUrl: item.absolute_url,
      title: item.title,
      companyName,
      careersUrl: `https://boards.greenhouse.io/${token}`,
      atsProvider: 'greenhouse',
      atsBoardToken: token,
      locationText: item.location?.name ?? null,
      description: stripHtml(item.content).slice(0, 5000),
      postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
    };
  });
}

export async function fetchLeverBoard(token: string, companyName: string): Promise<RawDiscoveredJob[]> {
  const payload = await fetchJson<Array<{
    id: string;
    text: string;
    hostedUrl: string;
    applyUrl?: string;
    createdAt?: number;
    categories?: { location?: string; commitment?: string; team?: string };
    descriptionPlain?: string;
    workplaceType?: string;
  }>>(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`);

  if (!Array.isArray(payload)) return [];
  return payload.slice(0, 120).map((item) => {
    const loc = [item.categories?.location, item.workplaceType].filter(Boolean).join(' · ');
    const postedAt = typeof item.createdAt === 'number' ? new Date(item.createdAt) : null;
    const commitment = item.categories?.commitment?.toLowerCase() ?? '';
    const explicitEmploymentType: JobEmploymentType | null =
      commitment.includes('intern') ? 'internship' : commitment.includes('full') ? 'full_time' : commitment.includes('contract') ? 'contract' : null;
    return {
      sourceName: 'lever',
      sourceUrl: item.hostedUrl,
      applyUrl: item.applyUrl || item.hostedUrl,
      title: item.text,
      companyName,
      careersUrl: `https://jobs.lever.co/${token}`,
      atsProvider: 'lever',
      atsBoardToken: token,
      locationText: loc || null,
      description: (item.descriptionPlain ?? '').slice(0, 5000),
      postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
      tags: [item.categories?.commitment, item.categories?.team].filter((t): t is string => Boolean(t)),
      explicitEmploymentType,
    };
  });
}

export async function fetchFirecrawlDiscoveryJobs(options: {
  apiKey: string;
  roleTitles: string[];
  internOnly: boolean;
  includeNational: boolean;
  includeInternational: boolean;
  homeCountry: string | null;
  creditBudget: number;
}): Promise<{ jobs: RawDiscoveredJob[]; creditsUsed: number; error: string | null }> {
  if (!options.apiKey.trim() || options.creditBudget <= 0) {
    return { jobs: [], creditsUsed: 0, error: null };
  }

  const jobs: RawDiscoveredJob[] = [];
  const seenUrls = new Set<string>();
  let creditsUsed = 0;
  let lastError: string | null = null;

  const atsSites = '(site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com)';
  const startupSites = '(site:wellfound.com/jobs OR site:workatastartup.com OR site:internshala.com OR site:cutshort.io)';
  const home = options.homeCountry || 'India';
  const baseRoles = options.roleTitles.length > 0 ? options.roleTitles.slice(0, 5) : ['Software Engineering Intern'];

  const queries: string[] = [];
  for (const role of baseRoles) {
    const internWord = options.internOnly && !/intern/iu.test(role) ? ' internship' : '';
    if (options.includeNational) {
      queries.push(`${startupSites} "${role}"${internWord} "${home}"`);
      queries.push(`${atsSites} "${role}"${internWord} "${home}"`);
    }
    if (options.includeInternational) {
      queries.push(`${atsSites} "${role}"${internWord} ("Remote Worldwide" OR "Work from anywhere" OR "APAC")`);
      queries.push(`${atsSites} "${role}"${internWord} ("relocation support" OR "relocation assistance" OR "relocation package")`);
    }
  }

  const maxQueries = Math.min(options.creditBudget, 10);
  for (const query of queries.slice(0, maxQueries)) {
    if (creditsUsed >= options.creditBudget) break;
    const res = await firecrawlWebSearch({
      apiKey: options.apiKey,
      query,
      limit: 10,
      tbs: 'qdr:m',
    });
    creditsUsed += 1;
    if (!res.ok) {
      lastError = res.error;
      break;
    }

    for (const hit of res.hits) {
      const cleanUrl = await resolveRedirectUrl(hit.url);
      if (/google\.[a-z.]+\/(?:goto|url)/iu.test(cleanUrl) || seenUrls.has(cleanUrl)) continue;
      seenUrls.add(cleanUrl);

      const cleanedTitle = hit.title.replace(/\s*\|\s*(?:Greenhouse|Lever|Ashby|Wellfound|Internshala|Cutshort).*$/iu, '').trim();
      const parts = cleanedTitle.split(/\s+(?:at|-|–|\|)\s+/iu).map((p) => p.trim()).filter(Boolean);
      const title = parts[0] || cleanedTitle;
      const host = (() => {
        try { return new URL(cleanUrl).hostname.replace(/^www\./u, ''); } catch { return ''; }
      })();
      let companyName = parts[1] || host;
      let parsedLocation: string | null = null;

      if (/[•·]/u.test(companyName)) {
        const compParts = companyName.split(/[•·]/u).map((p) => p.trim()).filter(Boolean);
        companyName = compParts[0] || companyName;
        if (compParts[1]) parsedLocation = compParts.slice(1).join(', ');
      }
      const atsTokenMatch = cleanUrl.match(/(?:boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com)\/([^/?#]+)/iu);
      if (atsTokenMatch?.[1] && (!parts[1] || /greenhouse|lever|ashby/iu.test(parts[1]))) {
        companyName = atsTokenMatch[1].replace(/[-_]+/gu, ' ').replace(/\b\w/gu, (c) => c.toUpperCase());
      }

      jobs.push({
        sourceName: 'firecrawl',
        sourceUrl: cleanUrl,
        applyUrl: cleanUrl,
        title: title.slice(0, 120),
        companyName: companyName.slice(0, 80),
        locationText: parsedLocation || (/remote/iu.test(`${hit.title} ${hit.description ?? ''}`) ? 'Remote' : options.homeCountry),
        description: (hit.markdown || hit.description || '').slice(0, 5000),
        postedAt: new Date(),
        explicitEmploymentType: options.internOnly ? 'internship' : null,
      });
    }
  }
  return { jobs, creditsUsed, error: lastError };
}

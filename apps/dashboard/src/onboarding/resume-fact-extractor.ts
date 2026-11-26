export type ResumeFactKind =
  | 'phone'
  | 'currentTitle'
  | 'locationCity'
  | 'locationCountry'
  | 'headline'
  | 'portfolioUrl'
  | 'linkedinUrl'
  | 'githubUrl'
  | 'skill'
  | 'education'
  | 'experience'
  | 'project';

export type ResumeSkillCategory =
  | 'programming_language'
  | 'frontend'
  | 'backend'
  | 'database'
  | 'tool'
  | 'cloud'
  | 'testing'
  | 'soft_skill'
  | 'other';

export interface ResumeFactCandidate {
  id: string;
  kind: ResumeFactKind;
  label: string;
  value: string;
  evidence: string;
  category?: ResumeSkillCategory;
  // Education fields
  institution?: string;
  educationLevel?: string | null;
  degree?: string | null;
  fieldOfStudy?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  graduationYear?: number | null;
  grade?: string | null;
  educationDescription?: string | null;
  isCurrent?: boolean;
  // Experience fields
  companyName?: string;
  jobTitle?: string;
  employmentType?: string | null;
  experienceLocation?: string | null;
  workArrangement?: string | null;
  experienceStartDate?: string | null;
  experienceEndDate?: string | null;
  experienceIsCurrent?: boolean;
  experienceDescription?: string | null;
  achievements?: string | null;
  // Project fields
  projectName?: string;
  tagline?: string | null;
  projectDescription?: string | null;
  role?: string | null;
  projectUrl?: string | null;
  repositoryUrl?: string | null;
  technologies?: string[];
  projectStartDate?: string | null;
  projectEndDate?: string | null;
  isOngoing?: boolean;
}

interface ExtractedUrl {
  url: string;
  host: string;
  label: string | null;
}

interface ParsedLine {
  raw: string;
  text: string;
  textWithoutUrls: string;
  isBullet: boolean;
  urls: ExtractedUrl[];
}

interface SkillDefinition {
  name: string;
  category: ResumeSkillCategory;
  pattern: RegExp;
  skillsOnly?: boolean;
}

const skillCatalog: SkillDefinition[] = [
  // Programming languages
  { name: 'JavaScript', category: 'programming_language', pattern: /\bjavascript\b|\bECMAScript\b/iu },
  { name: 'TypeScript', category: 'programming_language', pattern: /\btypescript\b/iu },
  { name: 'Python', category: 'programming_language', pattern: /\bpython\b/iu },
  { name: 'Java', category: 'programming_language', pattern: /\bjava\b(?!\s*script)/iu },
  { name: 'C++', category: 'programming_language', pattern: /(?:^|[\s,(/|])c\+\+(?:$|[\s,)/|;])/iu },
  { name: 'C#', category: 'programming_language', pattern: /(?:^|[\s,(/|])c#(?:$|[\s,)/|;])/iu },
  { name: 'C', category: 'programming_language', pattern: /^c$/iu, skillsOnly: true },
  { name: 'Go', category: 'programming_language', pattern: /\bgolang\b|\bgo\s+language\b/iu },
  { name: 'Rust', category: 'programming_language', pattern: /\brust\b/iu },
  { name: 'PHP', category: 'programming_language', pattern: /\bphp\b/iu },
  { name: 'Ruby', category: 'programming_language', pattern: /\bruby\b/iu },
  { name: 'Swift', category: 'programming_language', pattern: /\bswift\b/iu },
  { name: 'Kotlin', category: 'programming_language', pattern: /\bkotlin\b/iu },
  { name: 'Dart', category: 'programming_language', pattern: /\bdart\b/iu },
  { name: 'Bash', category: 'programming_language', pattern: /\bbash\b|\bshell\s+scripting\b/iu },
  { name: 'SQL', category: 'database', pattern: /\bsql\b/iu },
  // Frontend
  { name: 'HTML', category: 'frontend', pattern: /\bhtml5?\b/iu },
  { name: 'CSS', category: 'frontend', pattern: /\bcss3?\b/iu },
  { name: 'React', category: 'frontend', pattern: /\breact(?:\.?js)?\b(?!\s+native)/iu },
  { name: 'React Native', category: 'frontend', pattern: /\breact\s+native\b/iu },
  { name: 'Next.js', category: 'frontend', pattern: /\bnext\.?js\b/iu },
  { name: 'Vue', category: 'frontend', pattern: /\bvue(?:\.?js)?\b/iu },
  { name: 'Nuxt.js', category: 'frontend', pattern: /\bnuxt(?:\.?js)?\b/iu },
  { name: 'Angular', category: 'frontend', pattern: /\bangular\b/iu },
  { name: 'Svelte', category: 'frontend', pattern: /\bsvelte(?:kit)?\b/iu },
  { name: 'Astro', category: 'frontend', pattern: /\bastro\b/iu, skillsOnly: true },
  { name: 'Tailwind CSS', category: 'frontend', pattern: /\btailwind(?:\s*css)?\b/iu },
  { name: 'Bootstrap', category: 'frontend', pattern: /\bbootstrap\b/iu },
  { name: 'Sass', category: 'frontend', pattern: /\bsass\b|\bscss\b/iu },
  { name: 'Material UI', category: 'frontend', pattern: /\bmaterial\s*ui\b|\bmui\b/iu },
  { name: 'shadcn/ui', category: 'frontend', pattern: /\bshadcn(?:\/ui)?\b/iu },
  { name: 'Redux', category: 'frontend', pattern: /\bredux(?:\s+toolkit)?\b/iu },
  { name: 'Zustand', category: 'frontend', pattern: /\bzustand\b/iu },
  { name: 'TanStack Query', category: 'frontend', pattern: /\btanstack\s+query\b|\breact\s+query\b/iu },
  { name: 'EJS', category: 'frontend', pattern: /\bejs\b/iu },
  { name: 'Flutter', category: 'frontend', pattern: /\bflutter\b/iu },
  // Backend
  { name: 'Node.js', category: 'backend', pattern: /\bnode(?:\.?js)\b/iu },
  { name: 'Express', category: 'backend', pattern: /\bexpress(?:\.?js)\b|\bExpress\b/u },
  { name: 'NestJS', category: 'backend', pattern: /\bnest\.?js\b/iu },
  { name: 'Fastify', category: 'backend', pattern: /\bfastify\b/iu },
  { name: 'Hono', category: 'backend', pattern: /\bhono\b/iu },
  { name: 'Django', category: 'backend', pattern: /\bdjango\b/iu },
  { name: 'FastAPI', category: 'backend', pattern: /\bfastapi\b/iu },
  { name: 'Flask', category: 'backend', pattern: /\bflask\b/iu },
  { name: 'Spring Boot', category: 'backend', pattern: /\bspring\s+boot\b/iu },
  { name: 'Laravel', category: 'backend', pattern: /\blaravel\b/iu },
  { name: 'Ruby on Rails', category: 'backend', pattern: /\bruby\s+on\s+rails\b|\brails\b/iu },
  { name: 'ASP.NET', category: 'backend', pattern: /\basp\.net\b|\b\.net\b/iu },
  { name: 'GraphQL', category: 'backend', pattern: /\bgraphql\b/iu },
  { name: 'REST API', category: 'backend', pattern: /\brest(?:ful)?\s+apis?\b/iu },
  { name: 'Socket.IO', category: 'backend', pattern: /\bsocket\.io\b/iu },
  { name: 'WebSockets', category: 'backend', pattern: /\bweb\s*sockets?\b/iu },
  { name: 'Passport.js', category: 'backend', pattern: /\bpassport(?:\.?js)?\b/iu },
  { name: 'Multer', category: 'backend', pattern: /\bmulter\b/iu },
  { name: 'JWT', category: 'backend', pattern: /\bjwt\b|\bjson\s+web\s+tokens?\b/iu },
  { name: 'OAuth', category: 'backend', pattern: /\boauth2?\b/iu },
  { name: 'tRPC', category: 'backend', pattern: /\btrpc\b/iu },
  { name: 'Zod', category: 'backend', pattern: /\bzod\b/iu },
  // Databases & ORMs
  { name: 'PostgreSQL', category: 'database', pattern: /\bpostgres(?:ql)?\b/iu },
  { name: 'MySQL', category: 'database', pattern: /\bmysql\b/iu },
  { name: 'SQLite', category: 'database', pattern: /\bsqlite3?\b|\bbetter-sqlite3\b/iu },
  { name: 'MongoDB', category: 'database', pattern: /\bmongodb\b|\bmongoose\b/iu },
  { name: 'Redis', category: 'database', pattern: /\bredis\b/iu },
  { name: 'Prisma', category: 'database', pattern: /\bprisma(?:\s+orm)?\b/iu },
  { name: 'Drizzle ORM', category: 'database', pattern: /\bdrizzle(?:\s+orm)?\b/iu },
  { name: 'Sequelize', category: 'database', pattern: /\bsequelize\b/iu },
  { name: 'TypeORM', category: 'database', pattern: /\btypeorm\b/iu },
  { name: 'Supabase', category: 'database', pattern: /\bsupabase\b/iu },
  { name: 'Neon', category: 'database', pattern: /\bneon(?:\s+(?:db|database|postgres))?\b/iu },
  { name: 'DynamoDB', category: 'database', pattern: /\bdynamodb\b/iu },
  { name: 'Elasticsearch', category: 'database', pattern: /\belasticsearch\b/iu },
  // Cloud & DevOps
  { name: 'AWS', category: 'cloud', pattern: /\baws\b|\bamazon\s+web\s+services\b/iu },
  { name: 'Azure', category: 'cloud', pattern: /\bazure\b/iu },
  { name: 'Google Cloud', category: 'cloud', pattern: /\bgoogle\s+cloud\b|\bgcp\b/iu },
  { name: 'Firebase', category: 'cloud', pattern: /\bfirebase\b/iu },
  { name: 'Docker', category: 'cloud', pattern: /\bdocker\b/iu },
  { name: 'Kubernetes', category: 'cloud', pattern: /\bkubernetes\b|\bk8s\b/iu },
  { name: 'Cloudinary', category: 'cloud', pattern: /\bcloudinary\b/iu },
  { name: 'Vercel', category: 'cloud', pattern: /\bvercel\b/iu },
  { name: 'Netlify', category: 'cloud', pattern: /\bnetlify\b/iu },
  { name: 'Render', category: 'cloud', pattern: /\bRender\b/u },
  { name: 'Cloudflare', category: 'cloud', pattern: /\bcloudflare\b/iu },
  { name: 'Nginx', category: 'cloud', pattern: /\bnginx\b/iu },
  { name: 'GitHub Actions', category: 'cloud', pattern: /\bgithub\s+actions\b/iu },
  { name: 'CI/CD', category: 'cloud', pattern: /\bci\s*\/\s*cd\b/iu },
  { name: 'Terraform', category: 'cloud', pattern: /\bterraform\b/iu },
  // Tools
  { name: 'Git', category: 'tool', pattern: /\bgit\b(?!\s*hub|\s*lab)/iu },
  { name: 'GitHub', category: 'tool', pattern: /\bgithub\b/iu, skillsOnly: true },
  { name: 'GitLab', category: 'tool', pattern: /\bgitlab\b/iu, skillsOnly: true },
  { name: 'Linux', category: 'tool', pattern: /\blinux\b/iu },
  { name: 'Vite', category: 'tool', pattern: /\bvite\b/iu },
  { name: 'Webpack', category: 'tool', pattern: /\bwebpack\b/iu },
  { name: 'Postman', category: 'tool', pattern: /\bpostman\b/iu },
  { name: 'Figma', category: 'tool', pattern: /\bfigma\b/iu },
  { name: 'Jira', category: 'tool', pattern: /\bjira\b/iu },
  { name: 'VS Code', category: 'tool', pattern: /\bvs\s*code\b|\bvisual\s+studio\s+code\b/iu },
  { name: 'Stripe', category: 'tool', pattern: /\bstripe\b/iu },
  { name: 'Razorpay', category: 'tool', pattern: /\brazorpay\b/iu },
  { name: 'TinyMCE', category: 'tool', pattern: /\btinymce\b|\btiny\s+cloud\b/iu },
  { name: 'Axios', category: 'frontend', pattern: /\baxios\b/iu },
  { name: 'RBAC', category: 'backend', pattern: /\brbac\b|\brole[- ]based\s+access\s+control\b/iu },
  { name: 'npm', category: 'tool', pattern: /\bnpm\b/iu },
  { name: 'pnpm', category: 'tool', pattern: /\bpnpm\b/iu },
  { name: 'Yarn', category: 'tool', pattern: /\byarn\b/iu },
  { name: 'Bun', category: 'tool', pattern: /\bbun\b/iu, skillsOnly: true },
  { name: 'Monorepo', category: 'tool', pattern: /\bmonorepo\b/iu },
  { name: 'bcrypt', category: 'backend', pattern: /\bbcrypt(?:js)?\b/iu },
  { name: 'OpenAI', category: 'other', pattern: /\bopenai\b/iu },
  // Testing
  { name: 'Jest', category: 'testing', pattern: /\bjest\b/iu },
  { name: 'Vitest', category: 'testing', pattern: /\bvitest\b/iu },
  { name: 'Playwright', category: 'testing', pattern: /\bplaywright\b/iu },
  { name: 'Cypress', category: 'testing', pattern: /\bcypress\b/iu },
  { name: 'Selenium', category: 'testing', pattern: /\bselenium\b/iu },
  { name: 'Pytest', category: 'testing', pattern: /\bpytest\b/iu },
  { name: 'JUnit', category: 'testing', pattern: /\bjunit\b/iu },
  // Data / AI
  { name: 'PyTorch', category: 'other', pattern: /\bpytorch\b/iu },
  { name: 'TensorFlow', category: 'other', pattern: /\btensorflow\b/iu },
  { name: 'Pandas', category: 'other', pattern: /\bpandas\b/iu },
  { name: 'NumPy', category: 'other', pattern: /\bnumpy\b/iu },
  { name: 'Scikit-learn', category: 'other', pattern: /\bscikit-learn\b|\bsklearn\b/iu },
  { name: 'LangChain', category: 'other', pattern: /\blangchain\b/iu },
];

type SectionKind = 'header' | 'summary' | 'education' | 'experience' | 'projects' | 'skills' | 'other';

const sectionPatterns: Array<{ kind: Exclude<SectionKind, 'header'>; pattern: RegExp; allowInline?: boolean }> = [
  {
    kind: 'summary',
    pattern: /^(?:professional\s+|career\s+|executive\s+)?(?:summary|profile|about(?:\s+me)?|objective|overview)$/iu,
    allowInline: true,
  },
  {
    kind: 'education',
    pattern: /^(?:education(?:al\s+background)?|academic\s+(?:background|qualifications?)|academics|qualifications?|education\s*(?:&|and)\s*qualifications?)$/iu,
  },
  {
    kind: 'experience',
    pattern: /^(?:(?:work|professional|relevant|industry|freelance|internship)\s+experience|experience(?:\s*(?:&|and)\s*internships?)?|employment(?:\s+history)?|work\s+history|career\s+history|internships?)$/iu,
  },
  {
    kind: 'projects',
    pattern: /^(?:(?:selected|personal|academic|professional|featured|key|notable|technical|software|web|portfolio|open[\s-]source)\s+projects?|projects?(?:\s+experience|\s*(?:&|and)\s*(?:work|builds))?)$/iu,
  },
  {
    kind: 'skills',
    pattern: /^(?:(?:technical|key|core|programming|relevant)\s+skills(?:\s*(?:&|and)\s*(?:technologies|tools|expertise|competencies))?|skills(?:\s+summary|\s*(?:&|and)\s*(?:technologies|tools|expertise|competencies))?|core\s+competencies|competencies|technologies|(?:tech(?:nical|nology)?)\s+stack|tools\s*(?:&|and)\s*technologies|languages\s*(?:&|and)\s*(?:frameworks|technologies|tools)|areas\s+of\s+expertise)$/iu,
    allowInline: true,
  },
  {
    kind: 'other',
    pattern: /^(?:certifications?|certificates?|licenses?\s*(?:&|and)\s*certifications?|courses?|relevant\s+coursework|achievements?|awards?|honou?rs?(?:\s*(?:&|and)\s*awards?)?|accomplishments?|hackathons?(?:\s*(?:&|and)\s*competitions?)?|competitions?|extracurricular(?:\s+activities)?|activities|leadership(?:\s*(?:&|and)\s*activities)?|volunteering|volunteer(?:\s+experience)?|community|publications?|research|patents?|interests?|hobbies|languages|spoken\s+languages|references?|additional\s+information|contact(?:\s+(?:info|information|details))?|links|(?:online|coding|social)\s+profiles?)$/iu,
  },
];

const NON_PORTFOLIO_HOSTS = new Set([
  'linkedin.com', 'github.com', 'gitlab.com', 'bitbucket.org',
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'protonmail.com', 'live.com',
  'socket.io', 'react.dev', 'nodejs.org', 'nextjs.org', 'typescriptlang.org', 'prisma.io', 'drizzle.team',
  'leetcode.com', 'hackerrank.com', 'codeforces.com', 'codechef.com', 'geeksforgeeks.org', 'kaggle.com', 'unstop.com', 'devpost.com', 'devfolio.co',
  'twitter.com', 'x.com', 'instagram.com', 'facebook.com', 'youtube.com', 'youtu.be',
  'coursera.org', 'udemy.com', 'edx.org', 'credly.com', 'freecodecamp.org',
  'drive.google.com', 'docs.google.com', 'npmjs.com', 'pypi.org', 'docker.com', 'cloudinary.com',
  'vercel.com', 'netlify.com', 'render.com', 'heroku.com', 'example.com', 'rezi.ai', 'flowcv.com', 'canva.com',
]);

const GENERIC_LINK_LABEL = /^(?:live(?:\s+(?:demo|site|app|url|link|project))?|demo(?:\s+(?:link|url))?|github|git\s*hub|repo(?:sitory)?|source(?:\s+code)?|code|website|site|preview|deployed(?:\s+(?:url|link))?|visit|link|view|project\s+(?:url|link|demo)|linkedin|portfolio|web|url)$/iu;

const KNOWN_COUNTRIES: Array<{ name: string; pattern: RegExp }> = [
  { name: 'India', pattern: /\bindia\b/iu },
  { name: 'United States', pattern: /\b(?:united\s+states(?:\s+of\s+america)?|u\.?s\.?a\.?|us)\b/iu },
  { name: 'United Kingdom', pattern: /\b(?:united\s+kingdom|u\.?k\.?|england|scotland|wales)\b/iu },
  { name: 'Canada', pattern: /\bcanada\b/iu },
  { name: 'Germany', pattern: /\bgermany\b/iu },
  { name: 'Australia', pattern: /\baustralia\b/iu },
  { name: 'Singapore', pattern: /\bsingapore\b/iu },
  { name: 'United Arab Emirates', pattern: /\b(?:united\s+arab\s+emirates|u\.?a\.?e\.?|dubai)\b/iu },
  { name: 'Netherlands', pattern: /\bnetherlands\b/iu },
  { name: 'France', pattern: /\bfrance\b/iu },
  { name: 'Ireland', pattern: /\bireland\b/iu },
  { name: 'Japan', pattern: /\bjapan\b/iu },
  { name: 'Switzerland', pattern: /\bswitzerland\b/iu },
  { name: 'Sweden', pattern: /\bsweden\b/iu },
  { name: 'Poland', pattern: /\bpoland\b/iu },
  { name: 'Spain', pattern: /\bspain\b/iu },
  { name: 'Italy', pattern: /\bitaly\b/iu },
  { name: 'New Zealand', pattern: /\bnew\s+zealand\b/iu },
  { name: 'South Korea', pattern: /\bsouth\s+korea\b/iu },
  { name: 'Pakistan', pattern: /\bpakistan\b/iu },
  { name: 'Bangladesh', pattern: /\bbangladesh\b/iu },
  { name: 'Nepal', pattern: /\bnepal\b/iu },
  { name: 'Sri Lanka', pattern: /\bsri\s+lanka\b/iu },
  { name: 'Brazil', pattern: /\bbrazil\b/iu },
  { name: 'Mexico', pattern: /\bmexico\b/iu },
];

const INDIAN_STATES_PATTERN = /\b(?:himachal\s+pradesh|punjab|haryana|delhi|new\s+delhi|uttar\s+pradesh|uttarakhand|maharashtra|karnataka|tamil\s+nadu|telangana|andhra\s+pradesh|kerala|gujarat|rajasthan|west\s+bengal|madhya\s+pradesh|bihar|odisha|jharkhand|chhattisgarh|assam|goa|jammu\s+and\s+kashmir|chandigarh)\b/iu;

const MONTHS: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

function sanitizeFactText(value: string | null | undefined, maxLen: number): string {
  return (value ?? '')
    .replace(/[\u0000-\u001F\u007F]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLen);
}

function normalizeComparable(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/gu, ' ').replace(/[.,;:]+$/u, '');
}

function candidate(
  kind: ResumeFactKind,
  label: string,
  value: string,
  evidence: string,
  extras: Partial<ResumeFactCandidate> = {},
  idSuffix = '',
): ResumeFactCandidate {
  const baseKey = `${value}${idSuffix ? `:${idSuffix}` : ''}`.toLocaleLowerCase().replace(/\s+/gu, ' ').slice(0, 120);
  return { id: `${kind}:${baseKey}`, kind, label, value, evidence, ...extras };
}

function normalizeUrlValue(raw: string): { url: string; host: string } | null {
  const clean = raw.trim().replace(/[),.;:!?|\]>]+$/u, '');
  if (!clean || clean.includes('@')) return null;
  try {
    const normalized = /^https?:\/\//iu.test(clean) ? clean : `https://${clean}`;
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLocaleLowerCase().replace(/^www\./u, '');
    if (!['http:', 'https:'].includes(parsed.protocol) || !host.includes('.')) return null;
    if (/^\d+(?:\.\d+)+$/u.test(host)) return null;
    return { url: parsed.href, host };
  } catch {
    return null;
  }
}

function extractUrlsFromRawLine(raw: string): ExtractedUrl[] {
  const result: ExtractedUrl[] = [];
  const seen = new Set<string>();
  const push = (rawUrl: string, label: string | null) => {
    const parsed = normalizeUrlValue(rawUrl);
    if (!parsed || seen.has(parsed.url)) return;
    seen.add(parsed.url);
    result.push({ url: parsed.url, host: parsed.host, label: label?.trim() || null });
  };

  // 1. Markdown links emitted by pdf-parse or DOCX htmlToTextWithLinks: [Label](https://...)
  const mdLinkRegex = /\[([^\]]{1,120})\]\((https?:\/\/[^\s)]+)\)/giu;
  for (const match of raw.matchAll(mdLinkRegex)) {
    push(match[2], match[1]);
  }

  // 2. Parenthesized links with preceding label: Label (https://...)
  const parenLinkRegex = /([A-Za-z0-9][A-Za-z0-9\s/+-]{0,40})\s*\((https?:\/\/[^\s)]+)\)/giu;
  for (const match of raw.matchAll(parenLinkRegex)) {
    push(match[2], match[1]);
  }

  // 3. Explicit http(s)://, www., and recognizable bare domains (excluding emails)
  const strippedEmails = raw.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu, ' ');
  const bareUrlRegex = /(?:https?:\/\/|www\.)[^\s<>()[\]{}"']+|(?<![\w@./])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|dev|app|in|co|xyz|tech|me|site|ai|edu|gov|info|cloud|online|website|vercel\.app|netlify\.app|pages\.dev|github\.io|web\.app|railway\.app|onrender\.com)(?:\/[^\s<>()[\]{}"']*)?/giu;
  for (const match of strippedEmails.matchAll(bareUrlRegex)) {
    push(match[0], null);
  }

  return result;
}

function parseLines(text: string): ParsedLine[] {
  const rawLines = text
    .replace(/\u0000/gu, '')
    .replace(/\r\n?/gu, '\n')
    .split('\n');

  const parsed: ParsedLine[] = [];
  for (const rawInput of rawLines) {
    const trimmed = rawInput.replace(/[\t\u00a0]+/gu, ' ').trim();
    if (!trimmed) continue;
    // Skip PDF page footers and horizontal separator lines
    if (/^(?:--\s*\d+\s+of\s+\d+\s*--|page\s+\d+\s+of\s+\d+|[-_=─═*•·]{3,})$/iu.test(trimmed)) continue;

    const isBullet = /^(?:[•●▪◦·➢▸►*]|[-–—]\s+)/u.test(trimmed);
    const urls = extractUrlsFromRawLine(trimmed);

    // Replace Markdown links [Label](url) with just Label (or empty if Label is a URL)
    const unwrapped = trimmed
      .replace(/\[([^\]]{1,120})\]\((https?:\/\/[^\s)]+)\)/giu, (_m, label: string) => label.trim())
      .replace(/\(\s*https?:\/\/[^\s)]+\s*\)/giu, '');

    const clean = unwrapped
      .replace(/^[#\s>*•●▪◦·➢▸►]+/u, '')
      .replace(/^[-–—]\s+/u, '')
      .replace(/\*\*/gu, '')
      .replace(/\s+/gu, ' ')
      .trim();

    if (!clean) continue;

    const textWithoutUrls = clean
      .replace(/https?:\/\/[^\s<>()[\]{}"']+/giu, ' ')
      .replace(/\bwww\.[^\s<>()[\]{}"']+/giu, ' ')
      .replace(/\b(?:linkedin\.com|github\.com|gitlab\.com)\/[^\s<>()[\]{}"']+/giu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();

    parsed.push({
      raw: trimmed,
      text: clean,
      textWithoutUrls,
      isBullet,
      urls,
    });
  }
  return parsed;
}

function matchSectionHeading(
  line: ParsedLine,
  currentSection: SectionKind,
): { kind: Exclude<SectionKind, 'header'>; inlineRemainder: string | null } | null {
  if (line.isBullet) return null;
  const cleaned = line.text
    .replace(/^[─═_\-*\s]+/u, '')
    .replace(/[─═_\-*\s]+$/u, '')
    .trim();
  if (!cleaned || cleaned.length > 90) return null;

  // Standalone section heading (optionally ending with : or |)
  const standalone = cleaned.replace(/\s*[:|]\s*$/u, '').trim();
  if (standalone.length <= 55 && !/[.!?]$/u.test(standalone)) {
    for (const entry of sectionPatterns) {
      if (entry.pattern.test(standalone)) {
        // Inside Projects/Experience, a standalone "Tech Stack:" or "Technologies:" belongs to the project
        if (
          entry.kind === 'skills'
          && (currentSection === 'projects' || currentSection === 'experience')
          && /^(?:tech(?:nical|nology)?\s+stack|technologies|tools\s*(?:&|and)\s*technologies)$/iu.test(standalone)
        ) {
          return null;
        }
        return { kind: entry.kind, inlineRemainder: null };
      }
    }
  }

  // Inline heading like "Summary: ..." or "Technical Skills: ..."
  const colonIndex = cleaned.indexOf(':');
  if (colonIndex > 2 && colonIndex <= 32) {
    const left = cleaned.slice(0, colonIndex).trim();
    const right = cleaned.slice(colonIndex + 1).trim();
    if (right) {
      for (const entry of sectionPatterns) {
        if (!entry.allowInline || !entry.pattern.test(left)) continue;
        // Never let "Tech Stack: ..." or "Technologies: ..." hijack a Projects/Experience section
        if (entry.kind === 'skills') {
          if (currentSection === 'projects' || currentSection === 'experience') continue;
          if (!/^(?:(?:technical|key|core)\s+)?skills$/iu.test(left)) continue;
        }
        return { kind: entry.kind, inlineRemainder: right };
      }
    }
  }

  return null;
}

function splitIntoSections(lines: ParsedLine[]): Record<SectionKind, ParsedLine[]> {
  const sections: Record<SectionKind, ParsedLine[]> = {
    header: [],
    summary: [],
    education: [],
    experience: [],
    projects: [],
    skills: [],
    other: [],
  };

  let current: SectionKind = 'header';
  for (const line of lines) {
    const heading = matchSectionHeading(line, current);
    if (heading) {
      current = heading.kind;
      if (heading.inlineRemainder) {
        sections[current].push({
          ...line,
          text: heading.inlineRemainder,
          textWithoutUrls: heading.inlineRemainder.replace(/https?:\/\/[^\s]+/giu, ' ').trim(),
        });
      }
      continue;
    }
    sections[current].push(line);
  }
  return sections;
}

interface ParsedDateRange {
  startDate: string | null;
  endDate: string | null;
  startYear: number | null;
  endYear: number | null;
  isCurrent: boolean;
  matchedText: string | null;
}

function parseDateRange(text: string): ParsedDateRange {
  const monthToken = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const sep = '\\s*(?:-|–|—|\\bto\\b)\\s*';
  const presentToken = '(?:present|current(?:ly)?|ongoing|now|till\\s+date)';

  // 1. Month YYYY - Month YYYY | Present
  const monthRange = new RegExp(
    `\\b(${monthToken})\\.?\\s+((?:19|20)\\d{2})${sep}(?:(${monthToken})\\.?\\s+((?:19|20)\\d{2})|(${presentToken})|((?:19|20)\\d{2}))\\b`,
    'iu',
  );
  const m1 = text.match(monthRange);
  if (m1) {
    const startMonth = MONTHS[m1[1].toLowerCase()];
    const startYear = Number(m1[2]);
    const isCurrent = Boolean(m1[5]);
    const endMonth = m1[3] ? MONTHS[m1[3].toLowerCase()] : null;
    const endYear = m1[4] ? Number(m1[4]) : m1[6] ? Number(m1[6]) : null;
    return {
      startDate: startMonth ? `${startYear}-${startMonth}` : null,
      endDate: !isCurrent && endYear && endMonth ? `${endYear}-${endMonth}` : null,
      startYear,
      endYear: isCurrent ? null : endYear,
      isCurrent,
      matchedText: m1[0],
    };
  }

  // 2. MM/YYYY - MM/YYYY | Present  OR  YYYY-MM - YYYY-MM | Present
  const numericRange = new RegExp(
    `\\b(?:(0?[1-9]|1[0-2])[/.-]((?:19|20)\\d{2})|((?:19|20)\\d{2})[/.-](0?[1-9]|1[0-2]))${sep}(?:(0?[1-9]|1[0-2])[/.-]((?:19|20)\\d{2})|((?:19|20)\\d{2})[/.-](0?[1-9]|1[0-2])|(${presentToken}))\\b`,
    'iu',
  );
  const m2 = text.match(numericRange);
  if (m2) {
    const startMonth = (m2[1] ?? m2[4] ?? '').padStart(2, '0');
    const startYear = Number(m2[2] ?? m2[3]);
    const isCurrent = Boolean(m2[9]);
    const endMonth = m2[5] || m2[8] ? (m2[5] ?? m2[8]).padStart(2, '0') : null;
    const endYear = m2[6] ? Number(m2[6]) : m2[7] ? Number(m2[7]) : null;
    return {
      startDate: `${startYear}-${startMonth}`,
      endDate: !isCurrent && endYear && endMonth ? `${endYear}-${endMonth}` : null,
      startYear,
      endYear: isCurrent ? null : endYear,
      isCurrent,
      matchedText: m2[0],
    };
  }

  // 3. YYYY - YYYY | Present
  const yearRange = new RegExp(`\\b((?:19|20)\\d{2})${sep}((?:19|20)\\d{2}|${presentToken})\\b`, 'iu');
  const m3 = text.match(yearRange);
  if (m3) {
    const startYear = Number(m3[1]);
    const isPresentWord = !/^\d{4}$/u.test(m3[2]);
    const endYear = isPresentWord ? null : Number(m3[2]);
    const currentYear = new Date().getFullYear();
    const isFuture = endYear !== null && endYear > currentYear;
    return {
      startDate: null,
      endDate: null,
      startYear,
      endYear,
      isCurrent: isPresentWord || isFuture || /\b(?:expected|pursuing)\b/iu.test(text),
      matchedText: m3[0],
    };
  }

  // 4. Single Month YYYY
  const singleMonth = new RegExp(`\\b(?:expected\\s+)?(${monthToken})\\.?\\s+((?:19|20)\\d{2})\\b`, 'iu');
  const m4 = text.match(singleMonth);
  if (m4) {
    const month = MONTHS[m4[1].toLowerCase()];
    const year = Number(m4[2]);
    return {
      startDate: month ? `${year}-${month}` : null,
      endDate: null,
      startYear: year,
      endYear: year,
      isCurrent: /\b(?:present|current|ongoing|expected|pursuing)\b/iu.test(text) || year > new Date().getFullYear(),
      matchedText: m4[0],
    };
  }

  // 5. Single YYYY
  const singleYear = text.match(/\b(?:expected\s+|class\s+of\s+)?((?:19|20)\d{2})\b/iu);
  if (singleYear) {
    const year = Number(singleYear[1]);
    return {
      startDate: null,
      endDate: null,
      startYear: year,
      endYear: year,
      isCurrent: /\b(?:present|current|ongoing|expected|pursuing)\b/iu.test(text) || year > new Date().getFullYear(),
      matchedText: singleYear[0],
    };
  }

  return {
    startDate: null,
    endDate: null,
    startYear: null,
    endYear: null,
    isCurrent: /\b(?:present|current|ongoing)\b/iu.test(text),
    matchedText: null,
  };
}

function stripDateText(value: string, date: ParsedDateRange): string {
  let result = value;
  if (date.matchedText) {
    const escaped = date.matchedText.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    result = result.replace(new RegExp(`\\(?\\s*(?:expected\\s+)?${escaped}\\s*\\)?`, 'iu'), ' ');
  }
  return result
    .replace(/\(\s*(?:expected|pursuing|ongoing|present)\s*\)/giu, ' ')
    .replace(/\s*[|·,;/—–-]\s*$/u, '')
    .replace(/^\s*[|·,;/—–-]\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function extractPhone(lines: ParsedLine[]): ResumeFactCandidate | null {
  for (const line of lines.slice(0, 40)) {
    const hasPhoneCue = /(?:phone|mobile|contact|tel\b|\+\s*\d)/iu.test(line.text);
    const cleaned = line.textWithoutUrls.replace(/\b(?:19|20)\d{2}\s*[-–—/]\s*(?:19|20)\d{2}\b/gu, ' ');
    const matches = cleaned.match(/(?:\+?\d[\d\s().-]{7,18}\d)/gu) ?? [];
    for (const match of matches) {
      const digits = match.replace(/\D/gu, '');
      if (digits.length < 10 || digits.length > 15) continue;
      if (!hasPhoneCue && digits.length !== 10 && digits.length !== 12 && !match.trim().startsWith('+')) continue;
      return candidate('phone', 'Phone number', sanitizeFactText(match, 30), line.text);
    }
  }
  return null;
}

function extractLocation(headerLines: ParsedLine[]): { city: ResumeFactCandidate | null; country: ResumeFactCandidate | null } {
  for (const line of headerLines.slice(0, 15)) {
    if (line.isBullet) continue;
    const segments = line.textWithoutUrls
      .split(/\s*[|•●▪◦·]\s*/u)
      .map((s) => s.replace(/^(?:location|address|based\s+in)\s*[:–—-]\s*/iu, '').trim())
      .filter(Boolean);

    for (const segment of segments) {
      if (segment.length < 4 || segment.length > 85) continue;
      if (/@|\+?\d{5,}|https?:\/\//iu.test(segment)) continue;

      const matchedCountry = KNOWN_COUNTRIES.find((c) => c.pattern.test(segment));
      const matchedIndianState = INDIAN_STATES_PATTERN.test(segment);
      if (!matchedCountry && !matchedIndianState) continue;

      const countryName = matchedCountry?.name ?? 'India';
      const parts = segment.split(',').map((p) => p.trim()).filter(Boolean);
      let city: string | null = null;
      if (parts.length >= 2) {
        const first = parts[0].replace(/\b\d{5,6}\b/gu, '').trim();
        if (first && first.length >= 2 && first.length <= 50 && !KNOWN_COUNTRIES.some((c) => c.pattern.test(first))) {
          city = first;
        }
      }

      return {
        city: city ? candidate('locationCity', 'City', city, line.text) : null,
        country: candidate('locationCountry', 'Country', countryName, line.text),
      };
    }
  }
  return { city: null, country: null };
}

function extractCurrentTitle(headerLines: ParsedLine[]): ResumeFactCandidate | null {
  const titleCue = /\b(?:developer|engineer|architect|designer|analyst|scientist|student|intern|specialist|manager|consultant|programmer|full[- ]?stack|front[- ]?end|back[- ]?end|devops|sde|swe|undergraduate|graduate|researcher|administrator|lead)\b/iu;
  // Skip line 0 (typically the person's full name) unless it contains a pipe separating name | title
  for (let i = 0; i < Math.min(headerLines.length, 6); i += 1) {
    const line = headerLines[i];
    if (line.isBullet || line.urls.length > 0) continue;
    if (/@|\+?\d{7,}/u.test(line.text)) continue;

    let text = line.text;
    if (i === 0) {
      const split = text.split(/\s+(?:\||—|–|-)\s+/u);
      if (split.length < 2) continue;
      text = split.slice(1).join(' | ').trim();
    }
    if (text.length < 4 || text.length > 90 || /[.!?]$/u.test(text)) continue;
    if (!titleCue.test(text)) continue;
    if (KNOWN_COUNTRIES.some((c) => c.pattern.test(text)) && text.includes(',')) continue;
    return candidate('currentTitle', 'Current title', text, line.text);
  }
  return null;
}

function extractSummary(sections: Record<SectionKind, ParsedLine[]>): ResumeFactCandidate | null {
  const summaryLines = sections.summary;
  if (summaryLines.length > 0) {
    const excerpt: string[] = [];
    for (const line of summaryLines) {
      if (excerpt.join(' ').length >= 600) break;
      excerpt.push(line.text);
    }
    const value = sanitizeFactText(excerpt.join(' '), 160);
    if (value.length >= 20) {
      return candidate('headline', 'Headline / summary', value, excerpt.join('\n').slice(0, 600));
    }
  }

  // Fallback: long descriptive sentence in header
  const para = sections.header.find(
    (line) => !line.isBullet && line.urls.length === 0 && !/@|\d{7,}/u.test(line.text) && line.text.length >= 65 && /[.!?]$/u.test(line.text),
  );
  if (para) {
    return candidate('headline', 'Headline / summary', sanitizeFactText(para.text, 160), para.text.slice(0, 600));
  }
  return null;
}

function extractProfileUrls(
  sections: Record<SectionKind, ParsedLine[]>,
  allLines: ParsedLine[],
  projectUrls: Set<string>,
): ResumeFactCandidate[] {
  const results: ResumeFactCandidate[] = [];
  let linkedin: ResumeFactCandidate | null = null;
  let github: ResumeFactCandidate | null = null;
  let portfolio: ResumeFactCandidate | null = null;

  const priorityLines = [...sections.header, ...sections.other, ...allLines];
  const visited = new Set<ParsedLine>();

  for (const line of priorityLines) {
    if (visited.has(line)) continue;
    visited.add(line);
    const inHeader = sections.header.includes(line);
    const inProjects = sections.projects.includes(line);
    const inExperience = sections.experience.includes(line);
    if (inProjects || inExperience) continue;

    for (const item of line.urls) {
      if (projectUrls.has(item.url)) continue;

      const isLinkedin = item.host === 'linkedin.com' || item.host.endsWith('.linkedin.com');
      const isGithub = item.host === 'github.com' || item.host.endsWith('.github.com');

      if (isLinkedin && !linkedin) {
        linkedin = candidate('linkedinUrl', 'LinkedIn URL', item.url, line.text);
        continue;
      }

      if (isGithub && !github) {
        const pathParts = new URL(item.url).pathname.split('/').filter(Boolean);
        const explicitlyProfile = Boolean(item.label && /^git\s*hub$/iu.test(item.label)) || inHeader;
        if (pathParts.length === 1 || (explicitlyProfile && pathParts.length <= 1)) {
          github = candidate('githubUrl', 'GitHub URL', item.url, line.text);
        }
        continue;
      }

      if (!isLinkedin && !isGithub && !portfolio) {
        if (NON_PORTFOLIO_HOSTS.has(item.host)) continue;
        const explicitPortfolio =
          Boolean(item.label && /\b(?:portfolio|website|personal\s+site|site|web)\b/iu.test(item.label))
          || /\b(?:portfolio|personal\s+website|website)\b/iu.test(line.text);
        const isProjectCue = /\b(?:live\s+(?:demo|url|project)|project\s+(?:url|link)|demo\s+(?:url|link)|deployed)\b/iu.test(line.text);
        if ((inHeader || explicitPortfolio) && !isProjectCue) {
          portfolio = candidate('portfolioUrl', 'Portfolio / website URL', item.url, line.text);
        }
      }
    }
  }

  if (linkedin) results.push(linkedin);
  if (github) results.push(github);
  if (portfolio) results.push(portfolio);
  return results;
}

// --- Education Extraction ---

const degreePattern = /\b(?:bachelor(?:'s)?|master(?:'s)?|doctor(?:ate)?|ph\.?\s*d\.?|b\.?\s*tech|m\.?\s*tech|b\.?\s*e\.?|m\.?\s*e\.?|b\.?\s*sc\.?|m\.?\s*sc\.?|b\.?\s*s\.?|m\.?\s*s\.?|b\.?\s*a\.?|m\.?\s*a\.?|b\.?\s*com\.?|m\.?\s*com\.?|b\.?\s*c\.?\s*a\.?|m\.?\s*c\.?\s*a\.?|b\.?\s*b\.?\s*a\.?|m\.?\s*b\.?\s*a\.?|pgdm|diploma|associate(?:'s)?|higher\s+secondary|senior\s+secondary(?:\s+certificate)?|secondary\s+school(?:\s+certificate)?|high\s+school(?:\s+diploma)?|matriculation|intermediate|class\s+(?:10|12|x|xii)|grade\s+(?:10|12)|(?:10|12)th\s+(?:grade|standard|board|cbse|icse)?|hsc|ssc)\b/iu;
const institutionPattern = /\b(?:university|college|institute|school|academy|polytechnic|vidyalaya|convent|campus|iit|nit|iiit|bits|mit)\b/iu;
const educationNoisePattern = /\b(?:\d+(?:st|nd|rd|th)\s+place|winner|finalist|runner[- ]?up|hackathons?|competitions?|contests?|prizes?|medals?|mckinsey|leetcode|codewars|launchpad|workshops?|internships?)\b/iu;
const educationDetailPattern = /\b(?:relevant\s+)?coursework|speciali[sz]ation|major|minor|thesis|dissertation|currently\s+pursuing|pursuing|enrolled|expected\s+graduation|graduation\s+year|academic\s+honou?rs?|dean(?:'s)?\s+list|honors?\b/iu;

function educationLevel(degree: string): string | null {
  if (/\b(?:ph\.?\s*d|doctorate|doctoral)\b/iu.test(degree)) return 'doctorate';
  if (/\b(?:master|m\.?\s*tech|m\.?\s*e\.?|m\.?\s*sc|m\.?\s*s\.?\b|m\.?\s*a\.?\b|m\.?\s*com|m\.?\s*c\.?\s*a|m\.?\s*b\.?\s*a|pgdm|postgraduate)\b/iu.test(degree)) return 'master';
  if (/\b(?:bachelor|b\.?\s*tech|b\.?\s*e\.?|b\.?\s*sc|b\.?\s*s\.?\b|b\.?\s*a\.?\b|b\.?\s*com|b\.?\s*c\.?\s*a|b\.?\s*b\.?\s*a|undergraduate)\b/iu.test(degree)) return 'bachelor';
  if (/\b(?:diploma|polytechnic)\b/iu.test(degree)) return 'diploma';
  if (/\b(?:secondary|high\s+school|matriculation|intermediate|class\s+(?:10|12|x|xii)|grade\s+(?:10|12)|(?:10|12)th|hsc|ssc)\b/iu.test(degree)) return 'high_school';
  if (/\bassociate\b/iu.test(degree)) return 'associate';
  if (/\bbootcamp\b/iu.test(degree)) return 'bootcamp';
  return null;
}

function splitEducationBlocks(lines: ParsedLine[]): ParsedLine[][] {
  const blocks: ParsedLine[][] = [];
  let current: ParsedLine[] = [];

  for (const line of lines) {
    if (educationNoisePattern.test(line.text) && !degreePattern.test(line.text)) continue;

    if (current.length > 0 && !line.isBullet) {
      const hasInst = current.some((item) => institutionPattern.test(item.text));
      const hasDeg = current.some((item) => degreePattern.test(item.text));
      const hasDate = current.some((item) => Boolean(parseDateRange(item.text).matchedText));
      const lineIsInst = institutionPattern.test(line.text);
      const lineIsDeg = degreePattern.test(line.text) && !educationDetailPattern.test(line.text);

      const startsNew =
        (hasDeg && lineIsDeg)
        || (hasInst && lineIsInst && (hasDeg || hasDate))
        || (hasInst && hasDeg && Boolean(parseDateRange(line.text).matchedText) && !educationDetailPattern.test(line.text));

      if (startsNew) {
        blocks.push(current);
        current = [];
      }
    }
    current.push(line);
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function extractGrade(text: string): string | null {
  const afterKeyword = text.match(/\b(?:cgpa|gpa|grade|percentage|percent|score|marks)\s*[:–—-]?\s*([0-9]+(?:\.[0-9]+)?(?:\s*\/\s*(?:10(?:\.0)?|4(?:\.0)?|5(?:\.0)?|100))?\s*%?)/iu);
  if (afterKeyword?.[1]) return afterKeyword[1].trim();
  const beforeKeyword = text.match(/\b([0-9]+(?:\.[0-9]+)?(?:\s*\/\s*(?:10(?:\.0)?|4(?:\.0)?|5(?:\.0)?|100))?)\s*(?:cgpa|gpa)\b/iu);
  if (beforeKeyword?.[1]) return beforeKeyword[1].trim();
  const percentage = text.match(/\b([5-9]\d(?:\.\d{1,2})?|100(?:\.0+)?)\s*%/u);
  if (percentage) return `${percentage[1]}%`;
  return null;
}

const degreePrefixPattern = /^(bachelor(?:'s)?\s+of\s+(?:technology|engineering|science|arts|commerce|computer\s+applications?|business\s+administration|laws?|architecture|design|education|pharmacy)|master(?:'s)?\s+of\s+(?:technology|engineering|science|arts|commerce|computer\s+applications?|business\s+administration|laws?|architecture|design|education|pharmacy)|doctor\s+of\s+philosophy|ph\.?\s*d|b\.?\s*tech|m\.?\s*tech|b\.?\s*e|m\.?\s*e|b\.?\s*sc|m\.?\s*sc|b\.?\s*s|m\.?\s*s|b\.?\s*a|m\.?\s*a|b\.?\s*com|m\.?\s*com|b\.?\s*c\.?\s*a|m\.?\s*c\.?\s*a|b\.?\s*b\.?\s*a|m\.?\s*b\.?\s*a|pgdm|diploma|associate(?:'s)?(?:\s+of\s+(?:science|arts))?)(?=\s|$|[.,(–—/-])/iu;

const fieldOfStudyCuePattern = /\b(?:computer\s+science|engineering|information\s+technology|data\s+science|artificial\s+intelligence|machine\s+learning|cyber\s*security|electronics|mechanical|civil|electrical|software|mathematics|physics|chemistry|biology|commerce|economics|business|finance|management|arts|humanities|science|cse|it|ece|eee)\b/iu;

function splitDegreeAndField(raw: string): { degree: string | null; fieldOfStudy: string | null } {
  const cleaned = raw.replace(/\s+/gu, ' ').trim();
  if (!cleaned) return { degree: null, fieldOfStudy: null };

  // 1. Explicit "in" / "major in" / "specialization in" / "field of study:"
  const inMatch = cleaned.match(/\b(?:major(?:ed)?\s+in|speciali[sz]ation\s+in|field\s+of\s+study\s*[:–—-]?|in)\s+([^|;.]{2,90})/iu);
  if (inMatch && inMatch.index !== undefined && inMatch.index > 0) {
    const deg = cleaned.slice(0, inMatch.index).replace(/\s*[,–—-]\s*$/u, '').trim();
    const field = inMatch[1].replace(/^\((.+)\)$/u, '$1').replace(/\s*[|·,;/—–-]\s*$/u, '').trim();
    if (deg && field) return { degree: deg, fieldOfStudy: field };
  }

  // 2. Known degree prefix followed by field of study (with or without separators/parentheses)
  const prefixMatch = cleaned.match(degreePrefixPattern);
  if (prefixMatch) {
    const deg = prefixMatch[1].replace(/,\s*$/u, '').trim();
    let remainder = cleaned.slice(prefixMatch[0].length).trim();
    remainder = remainder.replace(/^(?:[.:–—,\-/|·]+|\bin\b)\s*/iu, '').trim();
    if (remainder.startsWith('(') && remainder.endsWith(')') && !remainder.slice(1, -1).includes('(')) {
      remainder = remainder.slice(1, -1).trim();
    }
    remainder = remainder.replace(/\s*[|·,;/—–-]\s*$/u, '').trim();
    if (remainder.length >= 2 && !/^(?:class\s+\d+|10th|12th|cbse|icse|honou?rs?|hons\.?|\d{4})$/iu.test(remainder)) {
      return { degree: deg, fieldOfStudy: remainder };
    }
    return { degree: cleaned, fieldOfStudy: null };
  }

  // 3. Parenthesized field of study on other qualifications
  const parenField = cleaned.match(/\(([^)]{2,80})\)/u);
  if (parenField && !/^(?:class\s+\d+|10th|12th|cbse|icse|honou?rs?|hons\.?|\d{4})/iu.test(parenField[1])) {
    const deg = cleaned.replace(parenField[0], '').replace(/\s+/gu, ' ').trim();
    return { degree: deg || cleaned, fieldOfStudy: parenField[1].trim() };
  }

  return { degree: cleaned, fieldOfStudy: null };
}

function parseEducationBlock(block: ParsedLine[], index: number): ResumeFactCandidate | null {
  const joined = block.map((line) => line.text).join('\n');
  const evidence = joined.slice(0, 1800);
  const fullText = block.map((line) => line.text).join(' ');

  const institutionLine = block.find((line) => institutionPattern.test(line.text) && !educationNoisePattern.test(line.text));
  const degreeLine = block.find((line) => degreePattern.test(line.text) && !educationNoisePattern.test(line.text));
  if (!institutionLine && !degreeLine) return null;

  const dates = parseDateRange(fullText);
  const grade = extractGrade(fullText);

  const stripGradeAndDate = (value: string): string => {
    let cleaned = stripDateText(value, dates);
    cleaned = cleaned
      .replace(/\b(?:cgpa|gpa|grade|percentage|percent|score|marks)\s*[:–—-]?\s*[0-9]+(?:\.[0-9]+)?(?:\s*\/\s*[0-9.]+)?\s*%?/giu, ' ')
      .replace(/\b[0-9]+(?:\.[0-9]+)?(?:\s*\/\s*[0-9.]+)?\s*(?:cgpa|gpa)\b/giu, ' ')
      .replace(/\b(?:[5-9]\d(?:\.\d{1,2})?|100(?:\.0+)?)\s*%/gu, ' ')
      .replace(/\s*[|·,;/—–-]\s*$/u, '')
      .replace(/^\s*[|·,;/—–-]\s*/u, '')
      .replace(/\s+/gu, ' ')
      .trim();
    return cleaned;
  };

  let institution = '';
  let degreeRaw = '';

  if (institutionLine && degreeLine && institutionLine === degreeLine) {
    const cleanedCombined = stripGradeAndDate(institutionLine.text);
    const majorParts = cleanedCombined.split(/\s+(?:\||·|—|–)\s+/u).map((p) => p.trim()).filter(Boolean);
    const parts = majorParts.length > 1
      ? majorParts
      : cleanedCombined.split(/,\s+(?=[A-Z])|\s+-\s+/u).map((p) => p.trim()).filter(Boolean);

    const instParts = parts.filter((p) => institutionPattern.test(p) && !degreePattern.test(p));
    const nonInstParts = parts.filter((p) => !instParts.includes(p));
    institution = instParts.join(', ') || parts.find((p) => institutionPattern.test(p)) || '';
    const degParts = nonInstParts.filter(
      (p) => degreePattern.test(p) || (fieldOfStudyCuePattern.test(p) && !KNOWN_COUNTRIES.some((c) => c.pattern.test(p))),
    );
    degreeRaw = degParts.join(' — ') || parts.find((p) => degreePattern.test(p)) || '';
  } else {
    institution = institutionLine ? stripGradeAndDate(institutionLine.text) : '';
    degreeRaw = degreeLine ? stripGradeAndDate(degreeLine.text) : '';
  }

  if (!institution) {
    const fallback = block.find(
      (line) => line !== degreeLine && !line.isBullet && !educationDetailPattern.test(line.text) && stripGradeAndDate(line.text).length >= 3,
    );
    if (fallback) institution = stripGradeAndDate(fallback.text);
  }

  if (!institution || institution.length > 180 || educationNoisePattern.test(institution)) return null;

  let { degree, fieldOfStudy } = splitDegreeAndField(degreeRaw);
  let fieldLine: ParsedLine | null = null;

  // If degree and field of study are on separate lines, capture the field line
  if (!fieldOfStudy) {
    fieldLine = block.find((line) => {
      if (line === institutionLine || line === degreeLine || line.isBullet) return false;
      const cleanedLine = stripGradeAndDate(line.text);
      return cleanedLine.length >= 2 && cleanedLine.length <= 75 && fieldOfStudyCuePattern.test(cleanedLine) && !educationDetailPattern.test(cleanedLine);
    }) ?? null;
    if (fieldLine) {
      fieldOfStudy = stripGradeAndDate(fieldLine.text);
    }
  }

  const extras = block
    .filter((line) =>
      line !== institutionLine
      && line !== degreeLine
      && line !== fieldLine
      && !educationNoisePattern.test(line.text)
      && (educationDetailPattern.test(line.text) || line.isBullet)
      && stripGradeAndDate(line.text).length >= 5,
    )
    .map((line) => line.text);

  return candidate(
    'education',
    `Education ${index + 1}`,
    institution,
    evidence,
    {
      institution,
      educationLevel: educationLevel(degree ?? degreeRaw),
      degree,
      fieldOfStudy,
      startDate: dates.startDate,
      endDate: dates.isCurrent ? null : dates.endDate,
      graduationYear: dates.endYear ?? (dates.startYear && !dates.isCurrent ? dates.startYear : null),
      grade: sanitizeFactText(grade, 32) || null,
      educationDescription: sanitizeFactText(extras.join(' · '), 800) || null,
      isCurrent: dates.isCurrent,
    },
    degree ?? String(index),
  );
}

// --- Experience Extraction ---

const jobTitlePattern = /\b(?:developer|engineer|intern|internship|designer|architect|analyst|scientist|manager|lead|leader|consultant|specialist|coordinator|assistant|associate|trainee|fellow|researcher|administrator|director|founder|co-founder|mentor|tutor|instructor|programmer|writer|editor|marketer|sde|swe|qa|tester|devops|full[- ]?stack|front[- ]?end|back[- ]?end|software)\b/iu;

function detectEmploymentType(text: string): string | null {
  if (/\bintern(?:ship)?\b/iu.test(text)) return 'internship';
  if (/\bfreelance\b|\bself[- ]?employed\b/iu.test(text)) return 'freelance';
  if (/\bcontract(?:or)?\b/iu.test(text)) return 'contract';
  if (/\bpart[- ]?time\b/iu.test(text)) return 'part_time';
  if (/\bvolunteer\b/iu.test(text)) return 'volunteer';
  if (/\bapprentice(?:ship)?\b/iu.test(text)) return 'apprenticeship';
  if (/\bfull[- ]?time\b/iu.test(text)) return 'full_time';
  return null;
}

function detectWorkArrangement(text: string): string | null {
  if (/\bremote\b/iu.test(text)) return 'remote';
  if (/\bhybrid\b/iu.test(text)) return 'hybrid';
  if (/\bon[- ]?site\b|\bin[- ]?office\b/iu.test(text)) return 'onsite';
  return null;
}

function isActionSentence(line: ParsedLine): boolean {
  if (line.isBullet) return true;
  if (line.text.length > 105 || /[.!?]$/u.test(line.text)) return true;
  return /^(?:built|developed|created|implemented|designed|engineered|led|managed|integrated|deployed|used|delivered|worked|added|improved|architected|collaborated|reduced|increased|optimized|automated|maintained|mentored|launched|migrated|refactored|tested|spearheaded|streamlined|authored|configured|responsible\s+for)\b/iu.test(line.text);
}

function splitExperienceBlocks(lines: ParsedLine[]): ParsedLine[][] {
  const blocks: ParsedLine[][] = [];
  let current: ParsedLine[] = [];

  for (const line of lines) {
    if (current.length > 0 && !line.isBullet) {
      const currentHasBody = current.some((item) => isActionSentence(item));
      const currentHasDate = current.some((item) => Boolean(parseDateRange(item.text).matchedText));
      const lineHasDate = Boolean(parseDateRange(line.text).matchedText);
      const lineIsHeaderLike = !isActionSentence(line) && line.text.length <= 120;

      if (lineIsHeaderLike && (currentHasBody || (currentHasDate && lineHasDate))) {
        blocks.push(current);
        current = [];
      }
    }
    current.push(line);
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function parseExperienceBlock(block: ParsedLine[], index: number): ResumeFactCandidate | null {
  const headerLines: ParsedLine[] = [];
  const bodyLines: ParsedLine[] = [];
  for (const line of block) {
    if (bodyLines.length === 0 && headerLines.length < 3 && !isActionSentence(line)) {
      headerLines.push(line);
    } else {
      bodyLines.push(line);
    }
  }
  if (headerLines.length === 0) return null;

  const headerText = headerLines.map((l) => l.text).join(' | ');
  const evidence = block.map((l) => l.text).join('\n').slice(0, 2200);
  const dates = parseDateRange(headerText);
  const workArrangement = detectWorkArrangement(headerText);
  const employmentType = detectEmploymentType(headerText);

  const rawSegments: string[] = [];
  for (const h of headerLines) {
    const cleaned = stripDateText(h.textWithoutUrls, dates);
    if (!cleaned) continue;
    // Handle "Job Title at Company Name"
    const atSplit = cleaned.split(/\s+at\s+/u);
    if (atSplit.length === 2 && jobTitlePattern.test(atSplit[0])) {
      rawSegments.push(atSplit[0].trim(), atSplit[1].trim());
      continue;
    }
    const pieces = cleaned.split(/\s+(?:\||·|—|–|-)\s+/u).map((p) => p.trim()).filter(Boolean);
    rawSegments.push(...pieces);
  }

  let jobTitle = '';
  let companyName = '';
  let location: string | null = null;

  const nonMetaSegments: string[] = [];
  for (const seg of rawSegments) {
    if (/^(?:remote|hybrid|on[- ]?site|in[- ]?office|full[- ]?time|part[- ]?time|contract|freelance)$/iu.test(seg)) {
      continue;
    }
    const looksLikeLocation =
      KNOWN_COUNTRIES.some((c) => c.pattern.test(seg))
      || INDIAN_STATES_PATTERN.test(seg);
    if (looksLikeLocation && !jobTitlePattern.test(seg) && !location) {
      location = seg;
      continue;
    }
    nonMetaSegments.push(seg);
  }

  if (nonMetaSegments.length === 1 && nonMetaSegments[0].includes(',')) {
    const commaParts = nonMetaSegments[0].split(',').map((p) => p.trim()).filter(Boolean);
    if (commaParts.length >= 2) {
      nonMetaSegments.splice(0, 1, ...commaParts);
    }
  }

  const titleIndex = nonMetaSegments.findIndex((seg) => jobTitlePattern.test(seg));
  if (titleIndex >= 0) {
    jobTitle = nonMetaSegments[titleIndex];
    companyName = nonMetaSegments.find((_seg, i) => i !== titleIndex) ?? '';
  } else if (nonMetaSegments.length >= 2) {
    jobTitle = nonMetaSegments[0];
    companyName = nonMetaSegments[1];
  }

  companyName = companyName.replace(/\s*[|·,;/—–-]\s*$/u, '').trim();
  jobTitle = jobTitle.replace(/\s*[|·,;/—–-]\s*$/u, '').trim();
  if (!companyName || !jobTitle) return null;

  const descriptionText = sanitizeFactText(bodyLines.map((l) => l.text).join(' · '), 1200) || null;
  const labelTitle = `${jobTitle} · ${companyName}`;

  return candidate(
    'experience',
    `Experience ${index + 1}`,
    labelTitle,
    evidence,
    {
      companyName,
      jobTitle,
      employmentType,
      experienceLocation: location,
      workArrangement,
      experienceStartDate: dates.startDate,
      experienceEndDate: dates.isCurrent ? null : dates.endDate,
      experienceIsCurrent: dates.isCurrent,
      experienceDescription: descriptionText,
      achievements: null,
    },
    `${companyName}:${jobTitle}`,
  );
}

// --- Project Extraction ---

const projectLinkLabelPrefix = /^(?:github|git\s*hub|repo(?:sitory)?|source(?:\s+code)?|live(?:\s+(?:demo|url|project|site|app))?|demo(?:\s+(?:url|link))?|project\s+(?:url|link|demo)|website|deployed(?:\s+(?:url|link))?|preview|links?)\s*[:–—-]/iu;
const projectTechLabelPrefix = /^(?:tech(?:nologies(?:\s+used)?|\s+stack)?|stack|built\s+with|tools(?:\s+(?:used|(?:&|and)\s+technologies))?|key\s+technologies)\s*[:–—-]/iu;
const projectRoleLabelPrefix = /^(?:role|my\s+role|position)\s*[:–—-]/iu;

function isTechStackOnlyText(text: string): boolean {
  const stripped = text.replace(projectTechLabelPrefix, '').trim();
  if (!stripped) return false;
  const items = stripped.split(/\s*[,|•·/]\s*/u).map((i) => i.trim()).filter(Boolean);
  if (items.length < 2) return false;
  const matched = items.filter((item) => skillCatalog.some((skill) => skill.pattern.test(item))).length;
  return matched >= 2 && matched / items.length >= 0.5;
}

function isProjectMetadataLine(line: ParsedLine): boolean {
  if (projectLinkLabelPrefix.test(line.text)) return true;
  if (projectTechLabelPrefix.test(line.text)) return true;
  if (projectRoleLabelPrefix.test(line.text)) return true;
  if (isTechStackOnlyText(line.textWithoutUrls)) return true;
  // Pure link line (e.g., "Live Demo | GitHub" where every token is a link label)
  if (line.urls.length > 0) {
    const remaining = line.textWithoutUrls
      .split(/\s*[|•·,/—–-]\s*/u)
      .map((p) => p.trim())
      .filter((p) => p && !GENERIC_LINK_LABEL.test(p));
    if (remaining.length === 0) return true;
  }
  // Pure date line
  const date = parseDateRange(line.text);
  if (date.matchedText && stripDateText(line.text, date).length === 0) return true;
  return false;
}

function isProjectTitleLine(line: ParsedLine): boolean {
  if (line.isBullet) return false;
  if (isProjectMetadataLine(line)) return false;
  if (isActionSentence(line)) return false;
  const cleaned = line.textWithoutUrls;
  if (!cleaned || cleaned.length < 2 || cleaned.length > 130) return false;
  return /[\p{L}]{2}/u.test(cleaned);
}

function splitProjectBlocks(lines: ParsedLine[]): ParsedLine[][] {
  const blocks: ParsedLine[][] = [];
  let current: ParsedLine[] = [];

  for (const line of lines) {
    if (current.length > 0 && isProjectTitleLine(line)) {
      const currentHasBody = current.some((item) => item.isBullet || isActionSentence(item));
      const currentHasMeta = current.length >= 2 && current.slice(1).some((item) => isProjectMetadataLine(item));
      const lineHasHeaderSignal =
        line.urls.length > 0
        || Boolean(parseDateRange(line.text).matchedText)
        || /\s+(?:\||—|–|-)\s+/u.test(line.text);

      if (currentHasBody || (currentHasMeta && lineHasHeaderSignal)) {
        blocks.push(current);
        current = [];
      }
    }
    current.push(line);
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function extractExplicitTechItems(text: string): string[] {
  const items = text
    .split(/\s*[,|•·;]\s*/u)
    .map((item) => item.replace(/^(?:and|&)\s+/iu, '').trim())
    .filter((item) => item.length >= 2 && item.length <= 40 && !/[.!?]/u.test(item));
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const catalogMatch = skillCatalog.find((skill) => skill.pattern.test(item));
    const finalName = catalogMatch ? catalogMatch.name : item;
    const key = normalizeComparable(finalName);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(finalName);
    }
  }
  return result;
}

function parseProjectBlock(block: ParsedLine[], index: number): ResumeFactCandidate | null {
  const titleLine = block[0];
  if (!titleLine || !isProjectTitleLine(titleLine)) return null;

  const evidence = block.map((l) => l.text).join('\n').slice(0, 2200);
  const blockUrls = block.flatMap((l) => l.urls);
  const dates = parseDateRange(block.slice(0, 3).map((l) => l.text).join(' ')) ?? parseDateRange(evidence);
  const fallbackDates = dates.matchedText ? dates : parseDateRange(evidence);

  // Clean title line: remove dates and generic trailing link labels like "| Live Demo | GitHub"
  let cleanTitle = stripDateText(titleLine.textWithoutUrls, fallbackDates);
  const titleSegments = cleanTitle
    .split(/\s+(?:\||—|–|-)\s+/u)
    .map((part) => part.trim())
    .filter((part) => part && !GENERIC_LINK_LABEL.test(part));

  let name = (titleSegments[0] ?? '').replace(/\s*[-:|]+$/u, '').trim();
  let tagline: string | null = null;
  const extraTechFromTitle: string[] = [];

  for (const seg of titleSegments.slice(1)) {
    if (isTechStackOnlyText(seg)) {
      extraTechFromTitle.push(...extractExplicitTechItems(seg));
    } else if (!tagline) {
      tagline = seg;
    }
  }

  // Handle "ProjectName: Tagline"
  if (!tagline && name.includes(':')) {
    const colonIdx = name.indexOf(':');
    const left = name.slice(0, colonIdx).trim();
    const right = name.slice(colonIdx + 1).trim();
    if (left.length >= 2 && left.length <= 50 && right.length >= 4) {
      name = left;
      tagline = right;
    }
  }

  if (name.length < 2 || skillCatalog.some((skill) => normalizeComparable(skill.name) === normalizeComparable(name))) {
    return null;
  }

  // Classify repository vs live project URLs
  const repoUrlObj = blockUrls.find((item) => {
    const isGitHost = item.host === 'github.com' || item.host.endsWith('.github.com') || item.host === 'gitlab.com' || item.host === 'bitbucket.org';
    const hasRepoLabel = Boolean(item.label && /\b(?:github|git\s*hub|repo(?:sitory)?|source|code)\b/iu.test(item.label));
    if (isGitHost) {
      try {
        return new URL(item.url).pathname.split('/').filter(Boolean).length >= 2 || hasRepoLabel;
      } catch {
        return hasRepoLabel;
      }
    }
    return hasRepoLabel;
  });

  const repositoryUrl = repoUrlObj?.url ?? null;

  const projectUrlObj = blockUrls.find((item) => {
    if (item.url === repositoryUrl) return false;
    if (item.host === 'linkedin.com' || item.host.endsWith('.linkedin.com')) return false;
    if (item.host === 'github.com' || item.host.endsWith('.github.com')) return false;
    return true;
  });
  const projectUrl = projectUrlObj?.url ?? null;

  // Role extraction
  const roleLine = block.find((l) => projectRoleLabelPrefix.test(l.text));
  const role = roleLine ? roleLine.text.replace(projectRoleLabelPrefix, '').trim() || null : null;

  // Technologies extraction (explicit tech stack lines + catalog matches across non-URL text)
  const techList: string[] = [];
  const seenTech = new Set<string>();
  const addTech = (tech: string) => {
    const key = normalizeComparable(tech);
    if (!key || seenTech.has(key)) return;
    seenTech.add(key);
    techList.push(tech);
  };

  extraTechFromTitle.forEach(addTech);
  for (const line of block.slice(1)) {
    if (projectTechLabelPrefix.test(line.text)) {
      extractExplicitTechItems(line.text.replace(projectTechLabelPrefix, '')).forEach(addTech);
    } else if (isTechStackOnlyText(line.textWithoutUrls)) {
      extractExplicitTechItems(line.textWithoutUrls).forEach(addTech);
    }
  }
  const techEvidenceText = block
    .filter((l) => !projectLinkLabelPrefix.test(l.text))
    .map((l) => l.textWithoutUrls)
    .join(' ');
  for (const skill of skillCatalog) {
    if (!skill.skillsOnly && skill.pattern.test(techEvidenceText)) {
      addTech(skill.name);
    }
  }

  // Description lines
  const descriptionLines = block
    .slice(1)
    .filter((line) => !isProjectMetadataLine(line))
    .map((line) => line.text);

  return candidate('project', `Project ${index + 1}`, name, evidence, {
    projectName: name,
    tagline: sanitizeFactText(tagline, 140) || null,
    projectDescription: sanitizeFactText(descriptionLines.join(' · '), 1200) || null,
    role,
    projectUrl,
    repositoryUrl,
    technologies: techList.map((t) => sanitizeFactText(t, 45)).filter(Boolean).slice(0, 20),
    projectStartDate: fallbackDates.startDate,
    projectEndDate: fallbackDates.isCurrent ? null : fallbackDates.endDate,
    isOngoing: fallbackDates.isCurrent,
  });
}

// --- Skills Extraction ---

function inferSkillCategory(prefix: string): ResumeSkillCategory {
  if (/\b(?:programming|languages?)\b/iu.test(prefix)) return 'programming_language';
  if (/\b(?:front[- ]?end|ui|web\s+design|client)\b/iu.test(prefix)) return 'frontend';
  if (/\b(?:back[- ]?end|server|api|frameworks?)\b/iu.test(prefix)) return 'backend';
  if (/\b(?:database|databases|db|data\s+store|orm)\b/iu.test(prefix)) return 'database';
  if (/\b(?:cloud|devops|deploy|hosting|infrastructure|platforms?)\b/iu.test(prefix)) return 'cloud';
  if (/\b(?:test(?:ing)?|qa|automation)\b/iu.test(prefix)) return 'testing';
  if (/\b(?:soft\s+skills?|interpersonal|communication)\b/iu.test(prefix)) return 'soft_skill';
  if (/\b(?:tools?|utilities|developer\s+tools|version\s+control)\b/iu.test(prefix)) return 'tool';
  return 'other';
}

function splitSkillTokens(rawList: string): string[] {
  // Split on commas, pipes, bullets, semicolons. Split "/" only when not CI/CD, UI/UX, or shadcn/ui.
  return rawList
    .split(/\s*[,|•●▪◦·;]\s*/u)
    .flatMap((chunk) => {
      if (/\b(?:ci\s*\/\s*cd|ui\s*\/\s*ux|shadcn\s*\/\s*ui|tcp\s*\/\s*ip|http\s*\/\s*https)\b/iu.test(chunk)) {
        return [chunk];
      }
      return chunk.split(/\s*\/\s*/u);
    })
    .map((token) => token.replace(/^\s*(?:and|&)\s+/iu, '').replace(/[.)]+$/u, (m) => (token.includes('(') ? m : '')).trim())
    .filter((token) => {
      if (!token || token.length > 42) return false;
      if (/[.!?]$/u.test(token) && !/\.(?:js|io|net)$/iu.test(token)) return false;
      if (token.split(/\s+/u).length > 4) return false;
      if (/^(?:and|or|etc|proficient|familiar|experienced|intermediate|advanced|beginner)$/iu.test(token)) return false;
      return true;
    });
}

const skillSubheadingPattern = /^(?:programming\s+languages?|languages?|front[- ]?end(?:\s+development)?|back[- ]?end(?:\s+development)?|databases?(?:\s*(?:&|and)\s*orms?)?|cloud(?:\s*(?:&|and)\s*devops)?|devops|tools?(?:\s*(?:&|and)\s*(?:platforms?|technologies))?|testing(?:\s*(?:&|and)\s*qa)?|frameworks?(?:\s*(?:&|and)\s*libraries)?|libraries|soft\s+skills?|other)$/iu;

const skillProseStopwordPattern = /\b(?:a|an|the|to|from|with|for|into|onto|plus|that|this|these|those|which|where|when|while|keep|reduce|aligned|separating|linking|using|based|through|across|between|about|their|your|our|its|was|were|are|is|be|been|have|has|had|will|can|could|should|would|built|developed|created|added|implemented|designed|managed|worked|order|records|shopping|workflow|returns|refund|checkout|storefront|inventory|tracking|overselling|privileged|operations|customer)\b/iu;

function isPlausibleCustomSkill(token: string): boolean {
  if (!token || token.length < 2 || token.length > 38) return false;
  if (skillProseStopwordPattern.test(token)) return false;
  const words = token.split(/\s+/u);
  if (words.length > 3) return false;
  // Reject all-lowercase prose phrases (e.g. "payment verification", "refund workflow")
  if (/^[a-z]+(?:\s+[a-z]+)+$/u.test(token)) return false;
  // Single all-lowercase words not in skillCatalog are usually stray prose words (e.g. "linking", "returns")
  if (words.length === 1 && /^[a-z]+$/u.test(token)) return false;
  return /[\p{L}]/u.test(token);
}

function extractSkills(sections: Record<SectionKind, ParsedLine[]>): ResumeFactCandidate[] {
  const skills: ResumeFactCandidate[] = [];
  const seen = new Set<string>();

  const addSkill = (name: string, category: ResumeSkillCategory, evidence: string) => {
    const key = normalizeComparable(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    skills.push(candidate('skill', 'Skill', name, evidence, { category }));
  };

  // Extract skills exclusively from the resume's Skills section.
  let activeCategory: ResumeSkillCategory = 'other';
  for (const line of sections.skills) {
    const rawText = line.textWithoutUrls.trim();
    if (!rawText) continue;

    // Skip narrative/prose sentences even if a PDF column layout mixes them near Skills
    const hasCategoryColon = /^[^:]{2,35}:\s+\S/u.test(rawText);
    const hasListSeparator = /[,|•●▪◦·;]/u.test(rawText);
    if (!hasCategoryColon && (isActionSentence(line) || (rawText.split(/\s+/u).length > 8 && !hasListSeparator))) {
      continue;
    }

    const colonIdx = rawText.indexOf(':');
    let listText = rawText;
    if (colonIdx > 1 && colonIdx <= 35) {
      activeCategory = inferSkillCategory(rawText.slice(0, colonIdx));
      listText = rawText.slice(colonIdx + 1).trim();
      if (!listText) continue;
    } else if (skillSubheadingPattern.test(rawText)) {
      activeCategory = inferSkillCategory(rawText);
      continue;
    }

    const tokens = splitSkillTokens(listText);
    for (const token of tokens) {
      const catalogMatch = skillCatalog.find((entry) => entry.pattern.test(token));
      if (catalogMatch) {
        addSkill(catalogMatch.name, catalogMatch.category, line.text);
      } else if (/^js$/iu.test(token)) {
        addSkill('JavaScript', 'programming_language', line.text);
      } else if (/^ts$/iu.test(token)) {
        addSkill('TypeScript', 'programming_language', line.text);
      } else if (/^go$/iu.test(token)) {
        addSkill('Go', 'programming_language', line.text);
      } else if (/^c$/iu.test(token)) {
        addSkill('C', 'programming_language', line.text);
      } else if (isPlausibleCustomSkill(token)) {
        addSkill(token, activeCategory, line.text);
      }
    }
  }

  return skills;
}

export function extractResumeFacts(text: string): ResumeFactCandidate[] {
  const lines = parseLines(text);
  const sections = splitIntoSections(lines);
  const facts: ResumeFactCandidate[] = [];
  const seen = new Set<string>();

  const add = (fact: ResumeFactCandidate | null) => {
    if (!fact) return;
    const key = `${fact.kind}:${normalizeComparable(fact.id)}`;
    if (seen.has(key)) return;
    seen.add(key);
    facts.push(fact);
  };

  // Extract projects first so project URLs are not misclassified as profile URLs
  const projectFacts: ResumeFactCandidate[] = [];
  const projectUrlSet = new Set<string>();
  splitProjectBlocks(sections.projects).forEach((block, index) => {
    const project = parseProjectBlock(block, index);
    if (project) {
      projectFacts.push(project);
      if (project.projectUrl) projectUrlSet.add(project.projectUrl);
      if (project.repositoryUrl) projectUrlSet.add(project.repositoryUrl);
    }
  });

  // Personal details
  add(extractPhone(sections.header.length ? sections.header : lines));
  add(extractCurrentTitle(sections.header));
  const loc = extractLocation(sections.header.length ? sections.header : lines.slice(0, 20));
  add(loc.city);
  add(loc.country);
  add(extractSummary(sections));
  extractProfileUrls(sections, lines, projectUrlSet).forEach(add);

  // Experience
  splitExperienceBlocks(sections.experience).forEach((block, index) => add(parseExperienceBlock(block, index)));

  // Education
  splitEducationBlocks(sections.education).forEach((block, index) => add(parseEducationBlock(block, index)));

  // Projects
  projectFacts.forEach(add);

  // Skills
  extractSkills(sections).forEach(add);

  return facts;
}

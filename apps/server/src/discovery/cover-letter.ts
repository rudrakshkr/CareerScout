import { ollamaChatText } from '../ai/ollama.js';
import { firecrawlWebSearch } from './connectors.js';
import type { UserProfileContext } from './types.js';

export interface CompanyResearchResult {
  summary: string | null;
  productFocus: string | null;
  sources: Array<{ title: string; url: string }>;
  externalResearchUsed: boolean;
}

export interface TailoredProjectHighlight {
  name: string;
  reason: string;
  pitch: string;
  url: string | null;
}

export interface TailoredApplicationPack {
  jobTitle: string;
  companyName: string;
  tailoredHeadline: string;
  tailoredSummary: string;
  matchedSkills: string[];
  highlightedProjects: TailoredProjectHighlight[];
  companyResearch: CompanyResearchResult;
  coverLetter: string;
  wordCount: number;
  markdownExport: string;
  generatedWithAi: boolean;
}

const GENERIC_JOB_HOSTS = /(?:greenhouse\.io|lever\.co|ashbyhq\.com|remotive\.com|remotefirstjobs\.com|arbeitnow\.com|jobicy\.com|ycombinator\.com|linkedin\.com|wellfound\.com|internshala\.com|simplify\.jobs|github\.com|indeed\.com|glassdoor\.com)$/iu;

const BANNED_PATTERNS: RegExp[] = [
  /^i am writing to express/im,
  /^i am thrilled to apply/im,
  /^i am passionate about/im,
  /^it is with great enthusiasm/im,
  /\bat the intersection of innovation and technology\b/iu,
  /\byour esteemed organization\b/iu,
  /\bi am eager to leverage my skills\b/iu,
  /\bi would be an invaluable asset\b/iu,
  /\bthrive in dynamic environments\b/iu,
  /\badmire your innovative approach\b/iu,
  /\bleader in the industry\b/iu,
  /\bfast[- ]paced environment\b/iu,
  /\bcutting[- ]edge technology\b/iu,
];

function stripHtmlClean(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

function extractMetaDescription(html: string): string | null {
  const match =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{25,350})["']/iu)
    ?? html.match(/<meta[^>]+content=["']([^"']{25,350})["'][^>]+name=["']description["']/iu)
    ?? html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{25,350})["']/iu);
  return match?.[1]?.replace(/\s+/gu, ' ').trim() || null;
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]{3,140})<\/title>/iu);
  return match?.[1]?.replace(/\s+/gu, ' ').trim() || null;
}

function extractCompanyWebsiteFromText(text: string): string | null {
  const urls = text.match(/https?:\/\/[^\s<>)"']+/giu) ?? [];
  for (const raw of urls) {
    try {
      const parsed = new URL(raw.replace(/[.,;!?)]+$/u, ''));
      if (!['http:', 'https:'].includes(parsed.protocol)) continue;
      if (GENERIC_JOB_HOSTS.test(parsed.hostname)) continue;
      return parsed.origin;
    } catch {
      // Ignore invalid URL
    }
  }
  return null;
}

export async function researchCompanyForCoverLetter(options: {
  companyName: string;
  companyWebsite?: string | null;
  jobSourceUrl: string;
  jobDescription?: string | null;
  firecrawlApiKey?: string | null;
}): Promise<CompanyResearchResult> {
  const sources: Array<{ title: string; url: string }> = [];
  const snippets: string[] = [];

  const candidateSite =
    options.companyWebsite
    || extractCompanyWebsiteFromText(options.jobDescription ?? '')
    || extractCompanyWebsiteFromText(options.jobSourceUrl);

  // 1. Direct official website / about page check (zero credits)
  if (candidateSite) {
    try {
      const origin = new URL(candidateSite).origin;
      for (const targetUrl of [origin, `${origin}/about`]) {
        try {
          const res = await fetch(targetUrl, {
            headers: { 'User-Agent': 'CareerScout-Local/0.5 (research)' },
            signal: AbortSignal.timeout(5500),
          });
          if (!res.ok) continue;
          const html = (await res.text()).slice(0, 140_000);
          const meta = extractMetaDescription(html);
          const pageTitle = extractTitleTag(html);
          if (meta && !snippets.includes(meta)) {
            snippets.push(meta);
            sources.push({ title: pageTitle || `${options.companyName} official site`, url: targetUrl });
          } else {
            const pMatch = html.match(/<p[^>]*>([\s\S]{50,360}?)<\/p>/iu);
            const cleanP = pMatch ? stripHtmlClean(pMatch[1]) : '';
            if (cleanP.length >= 45) {
              snippets.push(cleanP);
              sources.push({ title: pageTitle || `${options.companyName} official site`, url: targetUrl });
            }
          }
          if (snippets.length >= 2) break;
        } catch {
          // Ignore unreachable subpage
        }
      }
    } catch {
      // Ignore invalid website URL
    }
  }

  // 2. Firecrawl v2 search for official company product/about pages (1 credit, only if still light on context)
  if (options.firecrawlApiKey?.trim() && snippets.length < 2) {
    const fc = await firecrawlWebSearch({
      apiKey: options.firecrawlApiKey.trim(),
      query: `"${options.companyName}" official product OR about platform`,
      limit: 3,
    });
    if (fc.ok) {
      for (const hit of fc.hits) {
        try {
          const host = new URL(hit.url).hostname;
          if (GENERIC_JOB_HOSTS.test(host)) continue;
        } catch {
          continue;
        }
        const desc = (hit.description || hit.markdown || '').replace(/\s+/gu, ' ').trim().slice(0, 260);
        if (desc.length >= 35) {
          snippets.push(desc);
          sources.push({ title: hit.title.slice(0, 90), url: hit.url });
        }
        if (snippets.length >= 3) break;
      }
    }
  }

  const externalResearchUsed = snippets.length > 0;

  // 3. Fallback: extract concrete product sentence from the job description itself (never fabricate)
  let productFocus: string | null = null;
  if (snippets.length > 0) {
    productFocus = snippets[0].replace(/\s+/gu, ' ').trim().slice(0, 240);
  } else if (options.jobDescription) {
    const sentences = options.jobDescription
      .replace(/\s+/gu, ' ')
      .split(/(?<=[.!?])\s+/u)
      .map((s) => s.trim())
      .filter((s) => s.length >= 45 && s.length <= 240);
    const productSentence = sentences.find((s) =>
      /\b(?:builds?|building|platform|product|helps?|enables?|empowers?|developers?|teams?|customers?|mission)\b/iu.test(s)
      && !/\b(?:equal opportunity|benefits|salary|apply now|compensation)\b/iu.test(s),
    );
    if (productSentence) {
      productFocus = productSentence;
      sources.push({ title: 'Job description', url: options.jobSourceUrl });
    }
  }

  const summary = snippets.length > 0
    ? snippets.join(' ').slice(0, 480)
    : productFocus;

  return {
    summary,
    productFocus,
    sources: sources.slice(0, 3),
    externalResearchUsed,
  };
}

function scoreProjectRelevance(
  project: UserProfileContext['projects'][number],
  jobText: string,
  companyText: string,
): { score: number; reason: string } {
  const combined = `${jobText}\n${companyText}`.toLowerCase();
  const projectBlob = `${project.name} ${project.tagline ?? ''} ${project.description ?? ''} ${project.technologies.join(' ')}`.toLowerCase();

  let score = 0;
  const reasons: string[] = [];

  // Domain signals matching the Master Instructions project selection rules
  const isAiOrContentJob = /\b(?:ai\b|llm|generative|multimodal|gemini|openai|gpt|content|compliance|audit|governance|moderation|agent|saas|automation|product\s+engineer)\b/iu.test(combined);
  const isAiOrContentProject = /\b(?:ai\b|llm|gemini|openai|multimodal|audit|brand|compliance|wcag|pii)\b/iu.test(projectBlob);
  if (isAiOrContentJob && isAiOrContentProject) {
    score += 36;
    reasons.push('direct AI, validation pipeline, and product engineering overlap');
  }

  const isRealtimeOrBackendJob = /\b(?:real[\s-]?time|websocket|socket\.io|chat|messaging|collab|collaboration|messaging|event[\s-]?driven|distributed|backend|api|pagination|presence|saas)\b/iu.test(combined);
  const isRealtimeProject = /\b(?:socket\.io|websocket|real[\s-]?time|messaging|chat|presence|cursor|pagination|nexus)\b/iu.test(projectBlob);
  if (isRealtimeOrBackendJob && isRealtimeProject) {
    score += 34;
    reasons.push('real-time WebSocket, state management, and backend API overlap');
  }

  const isCommerceOrFintechJob = /\b(?:e[\s-]?commerce|commerce|fintech|payment|checkout|billing|stripe|razorpay|retail|storefront|order|inventory|marketplace|transaction|wallet)\b/iu.test(combined);
  const isCommerceProject = /\b(?:e[\s-]?commerce|storefront|razorpay|stripe|payment|checkout|inventory|order|refund|otp|pahari)\b/iu.test(projectBlob);
  if (isCommerceOrFintechJob && isCommerceProject) {
    score += 38;
    reasons.push('payments, checkout verification, inventory, and transaction workflow overlap');
  }

  // Tech stack overlap with JD
  const techOverlap = project.technologies.filter((tech) => {
    const clean = tech.trim();
    if (clean.length < 2) return false;
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'iu').test(combined);
  });
  if (techOverlap.length > 0) {
    score += Math.min(25, techOverlap.length * 6);
    reasons.push(`shared stack (${techOverlap.slice(0, 4).join(', ')})`);
  }

  // Slight tie-breaker preference for rich described projects
  if ((project.description?.length ?? 0) > 80) score += 4;

  return {
    score,
    reason: reasons.length > 0 ? reasons.join(' and ') : 'full-stack architecture and shipped product overlap',
  };
}

export function selectBestProjectsForJob(
  projects: UserProfileContext['projects'],
  jobText: string,
  companyText: string,
  maxProjects = 2,
): Array<{ project: UserProfileContext['projects'][number]; reason: string; score: number }> {
  if (projects.length === 0) return [];
  const scored = projects
    .map((project) => {
      const { score, reason } = scoreProjectRelevance(project, jobText, companyText);
      return { project, score, reason };
    })
    .sort((a, b) => b.score - a.score);

  // Choose 1 or 2 projects — never dump all 3
  const limit = Math.min(maxProjects, projects.length);
  if (limit === 2 && scored[0].score >= 45 && scored[1].score < 10) {
    return [scored[0]];
  }
  return scored.slice(0, limit);
}

export function selectRelevantSkills(
  profileSkills: UserProfileContext['skills'],
  matchedSkills: string[],
  selectedProjects: Array<{ project: UserProfileContext['projects'][number] }>,
  jobText: string,
): string[] {
  const chosen: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    const clean = name.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    chosen.push(clean);
  };

  for (const s of matchedSkills) add(s);

  const isAiRole = /\b(?:ai\b|llm|ml\b|machine\s+learning|generative|gemini|openai|prompt)\b/iu.test(jobText);
  for (const { project } of selectedProjects) {
    for (const tech of project.technologies) {
      if (!isAiRole && /\b(?:gemini|openai|llm|prompt|ai)\b/iu.test(tech)) continue;
      add(tech);
    }
  }

  for (const s of profileSkills.filter((x) => x.isHighlighted)) {
    if (!isAiRole && /\b(?:gemini|openai|llm|prompt|ai)\b/iu.test(s.name)) continue;
    add(s.name);
  }

  return chosen.slice(0, 6);
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

export function sanitizeCoverLetterText(raw: string): string {
  let cleaned = raw
    .replace(/^```(?:markdown|text)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .replace(/^(?:here(?:'s| is)\s+(?:a|your|the)\s+(?:tailored\s+)?cover\s+letter[^:\n]*:\s*)/iu, '')
    // Enforce zero em dashes per Master Instructions
    .replace(/\s*[—–]\s*/gu, ', ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();

  // Fix awkward ", ." or ", ," caused by dash replacement
  cleaned = cleaned.replace(/,\s*,/gu, ',').replace(/,\s*\./gu, '.');
  return cleaned;
}

export function violatesMasterStyle(letter: string): boolean {
  const words = countWords(letter);
  if (words < 120 || words > 310) return true;
  if (letter.includes('—')) return true;
  return BANNED_PATTERNS.some((pattern) => pattern.test(letter));
}

function summarizeProjectNaturally(project: UserProfileContext['projects'][number], isAiRole: boolean): string {
  const desc = (project.description ?? project.tagline ?? '')
    .replace(/\s*[—–]\s*/gu, ', ')
    .replace(/\s*·\s*/gu, '. ')
    .replace(/\s+/gu, ' ')
    .trim();

  const relevantTech = project.technologies
    .filter((t) => isAiRole || !/\b(?:gemini|openai|llm|ai)\b/iu.test(t))
    .slice(0, 4);

  if (desc) {
    const sentences = desc.split(/(?<=[.!?])\s+/u).filter(Boolean);
    const chosen = sentences.slice(0, 2).join(' ');
    const trimmed = chosen.length > 210 ? `${chosen.slice(0, 207).replace(/\s+\S*$/u, '')}.` : chosen;
    const ended = /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
    return `${project.name}${relevantTech.length ? ` (${relevantTech.join(', ')})` : ''}: ${ended}`;
  }

  return `${project.name}, built with ${relevantTech.join(', ') || 'React, TypeScript, and Node.js'}.`;
}

function buildDeterministicMasterLetter(options: {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  profile: UserProfileContext;
  selectedProjects: Array<{ project: UserProfileContext['projects'][number]; reason: string }>;
  relevantSkills: string[];
  research: CompanyResearchResult;
}): string {
  const { jobTitle, companyName, jobDescription, profile, selectedProjects, relevantSkills, research } = options;
  const isAiRole = /\b(?:ai\b|llm|ml\b|machine\s+learning|generative|gemini|openai|prompt)\b/iu.test(`${jobTitle} ${jobDescription}`);
  const edu = profile.education[0] ?? null;

  const introIdentity = edu
    ? `I am ${profile.displayName}, a ${[edu.degree, edu.fieldOfStudy].filter(Boolean).join(' in ')} student at ${edu.institution} applying for the ${jobTitle} role at ${companyName}.`
    : `I am ${profile.displayName}, a ${profile.currentTitle || 'full-stack software developer'} applying for the ${jobTitle} role at ${companyName}.`;

  let companyHook = '';
  if (research.productFocus) {
    const cleanFocus = research.productFocus
      .replace(/\s*[—–]\s*/gu, ', ')
      .replace(/\.$/u, '')
      .trim();
    companyHook = `Looking into ${companyName}'s work (${cleanFocus.length > 140 ? `${cleanFocus.slice(0, 137).replace(/\s+\S*$/u, '')}...` : cleanFocus}), the engineering focus lines up closely with the kind of end-to-end product work I build.`;
  } else {
    companyHook = `The ${jobTitle} opening caught my attention because I enjoy owning full features from database schema and API design through to deployed frontend interfaces.`;
  }

  const stackPhrase = relevantSkills.length > 0
    ? `I work across ${relevantSkills.slice(0, 5).join(', ')} to take features from data modeling and APIs to clean, reliable user interfaces.`
    : 'I build full-stack web applications end to end, focusing on clean API design, reliable data models, and responsive interfaces.';

  const projectLines = selectedProjects.length > 0
    ? selectedProjects.map(({ project }) => summarizeProjectNaturally(project, isAiRole)).join(' ')
    : '';

  const projectsParagraph = projectLines
    ? `The clearest proof of what I can bring is in what I have shipped. ${projectLines}`
    : '';

  const closing = `I am looking for an internship where I can contribute to production code, solve practical engineering problems, and take real ownership of features at ${companyName}. I would welcome the chance to discuss how my project experience fits what your team needs.`;

  const contactLine = [
    profile.portfolioUrl ? `Portfolio: ${profile.portfolioUrl}` : null,
    profile.githubUrl ? `GitHub: ${profile.githubUrl}` : null,
    profile.linkedinUrl ? `LinkedIn: ${profile.linkedinUrl}` : null,
  ].filter(Boolean).join(' | ');

  const letter = [
    `Hi ${companyName} Team,`,
    '',
    `${introIdentity} ${companyHook}`,
    '',
    stackPhrase,
    projectsParagraph ? `\n${projectsParagraph}` : '',
    '',
    closing,
    '',
    `Best,`,
    profile.displayName,
    contactLine,
  ]
    .filter((part, idx, arr) => !(part === '' && arr[idx - 1] === ''))
    .join('\n');

  return sanitizeCoverLetterText(letter);
}

export async function buildMasterCoverLetterPack(options: {
  job: { title: string; companyName: string; description: string | null; sourceUrl: string };
  companyWebsite?: string | null;
  matchedSkills: string[];
  profile: UserProfileContext;
  firecrawlApiKey?: string | null;
  ollama: { enabled: boolean; baseUrl: string; model: string | null };
}): Promise<TailoredApplicationPack> {
  const { job, companyWebsite, matchedSkills, profile, firecrawlApiKey, ollama } = options;
  const jobDescription = job.description ?? '';

  // 1. Research the company first
  const research = await researchCompanyForCoverLetter({
    companyName: job.companyName,
    companyWebsite,
    jobSourceUrl: job.sourceUrl,
    jobDescription,
    firecrawlApiKey,
  });

  // 2. Select strictly 1 or 2 most relevant projects and focused skills
  const selectedProjects = selectBestProjectsForJob(
    profile.projects,
    `${job.title}\n${jobDescription}`,
    research.summary ?? '',
    2,
  );
  const relevantSkills = selectRelevantSkills(
    profile.skills,
    matchedSkills,
    selectedProjects,
    `${job.title}\n${jobDescription}`,
  );

  // 3. Build cover letter via local Ollama (with Master Instructions) or deterministic fallback
  let coverLetter = '';
  let generatedWithAi = false;

  if (ollama.enabled) {
    const edu = profile.education[0];
    const isAiRole = /\b(?:ai\b|llm|ml\b|machine\s+learning|generative|gemini|openai|prompt)\b/iu.test(`${job.title} ${jobDescription}`);

    const systemPrompt = [
      'You are writing a personal, ready-to-use internship cover letter for a real software developer.',
      'FOLLOW EVERY NUMBERED RULE LITERALLY:',
      `1. Write ONLY for the "${job.title}" role at "${job.companyName}". Mention "${job.companyName}" naturally and NEVER reference any other employer.`,
      '2. Length MUST be between 180 and 240 words total (3 or 4 short paragraphs).',
      '3. Tone: plain, direct, natural developer English. Confident without arrogance, professional without stiffness, never desperate.',
      '4. FORBIDDEN OPENINGS: "I am writing to express...", "I am thrilled to apply...", "I am passionate about...", "It is with great enthusiasm...".',
      '5. FORBIDDEN PHRASES: "at the intersection of", "esteemed organization", "eager to leverage", "invaluable asset", "thrive in dynamic environments", "fast-paced environment", "cutting-edge technology", "innovative approach", "leader in the industry".',
      '6. FORBIDDEN PUNCTUATION: Do NOT use em dashes (—). Use commas or periods instead.',
      '7. SKILLS RULE: Never list a long comma-separated dump of frameworks. Show skills through what the 1-2 selected projects actually build and solve.',
      '8. TRUTH RULE: Use ONLY the verified projects, skills, education, and company facts given in the user message. NEVER invent user counts, metrics, revenue, features, or claim long-time product usage.',
      isAiRole ? '9. AI RULE: Practical AI/LLM work is relevant to this role, so highlight it naturally.' : '9. AI RULE: This is NOT an AI role. Do NOT force AI or LLM experience into the letter.',
      '10. OUTPUT FORMAT: Output ONLY the final cover letter (greeting, paragraphs, sign-off and links). Zero intro, zero notes, zero markdown code fences.',
    ].join('\n');

    const userPrompt = [
      `CANDIDATE:`,
      `Name: ${profile.displayName}`,
      `Headline: ${profile.currentTitle || 'Full-Stack Software Engineer'}`,
      edu ? `Education: ${[edu.degree, edu.fieldOfStudy, edu.institution].filter(Boolean).join(', ')}` : '',
      `Relevant skills for THIS role only: ${relevantSkills.join(', ')}`,
      '',
      `SELECTED PROJECTS (highlight these 1-2 projects only, explain what they do):`,
      ...selectedProjects.map(({ project, reason }) =>
        `- ${project.name} (${reason}): ${project.tagline || ''} ${project.description || ''} | Tech: ${project.technologies.join(', ')}`,
      ),
      '',
      `TARGET ROLE: ${job.title} at ${job.companyName}`,
      `COMPANY RESEARCH (use concrete facts only; if minimal, do not invent details):`,
      research.summary || 'Limited external info available. Base relevance strictly on the job description below.',
      '',
      `JOB DESCRIPTION EXCERPT:`,
      jobDescription.slice(0, 1400) || 'No full description provided.',
      '',
      `LINKS TO INCLUDE AT SIGN-OFF:`,
      [profile.portfolioUrl, profile.githubUrl, profile.linkedinUrl].filter(Boolean).join(' | '),
    ].filter(Boolean).join('\n');

    const aiDraft = await ollamaChatText({
      baseUrl: ollama.baseUrl,
      model: ollama.model,
      system: systemPrompt,
      user: userPrompt,
      timeoutMs: 120_000,
      numPredict: 540,
      temperature: 0.25,
    });

    if (aiDraft) {
      const cleaned = sanitizeCoverLetterText(aiDraft);
      const companyToken = job.companyName.trim().split(/\s+/u)[0]?.toLowerCase() ?? '';
      const mentionsTargetCompany = !companyToken || cleaned.toLowerCase().includes(companyToken);
      if (mentionsTargetCompany && !violatesMasterStyle(cleaned)) {
        coverLetter = cleaned;
        generatedWithAi = true;
      }
    }
  }

  if (!coverLetter) {
    coverLetter = buildDeterministicMasterLetter({
      jobTitle: job.title,
      companyName: job.companyName,
      jobDescription,
      profile,
      selectedProjects,
      relevantSkills,
      research,
    });
  }

  const tailoredHeadline = `${profile.currentTitle || 'Full-Stack Software Engineer'} | ${relevantSkills.slice(0, 4).join(', ') || 'React, TypeScript, Node.js'}`;
  const edu = profile.education[0];
  const tailoredSummary = [
    edu
      ? `${[edu.degree, edu.fieldOfStudy].filter(Boolean).join(' in ')} student at ${edu.institution}`
      : `${profile.currentTitle || 'Full-stack software engineer'}`,
    relevantSkills.length ? `building production web applications with ${relevantSkills.slice(0, 5).join(', ')}.` : 'building production web applications.',
    selectedProjects.length ? `Key relevant builds: ${selectedProjects.map((s) => s.project.name).join(' and ')}.` : '',
  ].filter(Boolean).join(' ');

  const highlightedProjects: TailoredProjectHighlight[] = selectedProjects.map(({ project, reason }) => ({
    name: project.name,
    reason,
    pitch: (project.description ?? project.tagline ?? `Built with ${project.technologies.join(', ')}`).replace(/\s*[—–]\s*/gu, ', ').slice(0, 260),
    url: project.projectUrl || project.repositoryUrl || null,
  }));

  const markdownExport = [
    `# Tailored Application Pack: ${job.title} at ${job.companyName}`,
    `Posting: ${job.sourceUrl}`,
    '',
    `## Tailored Resume Headline`,
    tailoredHeadline,
    '',
    `## Tailored Resume Summary`,
    tailoredSummary,
    '',
    `## Relevant Skills to Emphasize`,
    relevantSkills.join(', ') || 'See profile',
    '',
    `## Selected Projects (Top ${highlightedProjects.length})`,
    ...highlightedProjects.map((p) => `- **${p.name}** (${p.reason}): ${p.pitch}${p.url ? ` (${p.url})` : ''}`),
    '',
    `## Company Research Notes`,
    research.summary || 'No external company summary available; grounded in the job posting.',
    ...research.sources.map((s) => `- ${s.title}: ${s.url}`),
    '',
    `## Cover Letter (${countWords(coverLetter)} words)`,
    coverLetter,
  ].join('\n');

  return {
    jobTitle: job.title,
    companyName: job.companyName,
    tailoredHeadline,
    tailoredSummary,
    matchedSkills: relevantSkills,
    highlightedProjects,
    companyResearch: research,
    coverLetter,
    wordCount: countWords(coverLetter),
    markdownExport,
    generatedWithAi,
  };
}

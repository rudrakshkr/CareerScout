import { ollamaChatJson } from './ollama.js';

export interface OllamaRuntimeOptions {
  enabled: boolean;
  baseUrl: string;
  model: string | null;
}

export interface EmployeeVerificationDecision {
  currentlyWorksAtTarget: boolean;
  isRelevantContact: boolean;
  reason: string;
}

export interface InternationalJobDecision {
  eligibleFromIndia: boolean;
  mode: 'wfh_from_india' | 'relocation_from_india' | 'ineligible';
  reason: string;
}

const EMPLOYEE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    currentlyWorksAtTarget: { type: 'boolean' },
    isRelevantContact: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['currentlyWorksAtTarget', 'isRelevantContact', 'reason'],
};

const INTERNATIONAL_JOB_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    eligibleFromIndia: { type: 'boolean' },
    mode: { type: 'string', enum: ['wfh_from_india', 'relocation_from_india', 'ineligible'] },
    reason: { type: 'string' },
  },
  required: ['eligibleFromIndia', 'mode', 'reason'],
};

/**
 * Uses a small local model (e.g., qwen3.5:4b) with ultra-explicit rules and
 * concrete examples to verify whether a discovered person CURRENTLY works at
 * or is actively hiring for the exact target company.
 *
 * Returns null if Ollama is disabled or unreachable (caller falls back to
 * strict deterministic verification).
 */
export async function verifyCurrentEmployeeWithAi(options: {
  ollama: OllamaRuntimeOptions;
  targetCompany: string;
  targetDomain: string | null;
  jobTitle: string;
  personName: string;
  personHeadline: string;
  profileUrl: string;
  evidenceSnippet: string;
  platform: string;
}): Promise<EmployeeVerificationDecision | null> {
  if (!options.ollama.enabled) return null;

  const system = [
    'You are a strict employment fact-checker. Your job is to prevent sending outreach to the WRONG person or to EX-EMPLOYEES.',
    'Follow these rules literally. When unsure, ALWAYS return false.',
    '',
    'RULE 1 - EXACT SAME COMPANY:',
    '- Confirm the person works at the EXACT target company, not a different company with a similar name (for example, "APT" at apt.trading is NOT "Aptos Labs").',
    '',
    'RULE 2 - CURRENT EMPLOYMENT ONLY (REJECT ALL FORMER / EX-EMPLOYEES):',
    '- Return currentlyWorksAtTarget = false if the text says "Ex-", "Former", "Previously at", "Past:", "Worked at", "Alumni", or shows an ended date range (like "2021 - 2024") at the target company.',
    '- Return currentlyWorksAtTarget = false if their current headline or current employer is a DIFFERENT company (for example, "Recruiter at BrowserStack" when target is "APT", or "SWE at Google | Ex-Stripe" when target is "Stripe").',
    '- Return currentlyWorksAtTarget = true ONLY if the evidence clearly indicates they CURRENTLY work at the target company or are currently hiring there.',
    '',
    'RULE 3 - RELEVANT CONTACT:',
    '- Return isRelevantContact = true if they are a current software/web engineer, tech lead, engineering manager, recruiter, talent acquisition member, CTO, or founder at the target company.',
    '- Return isRelevantContact = false if they are a student/intern alumni, unrelated sales/support person, or third-party agency recruiter not at the company.',
    '',
    'EXAMPLES:',
    '- Target: "APT" | Headline: "Lead Technical Recruiter - BrowserStack" -> {"currentlyWorksAtTarget": false, "isRelevantContact": false, "reason": "Works at BrowserStack, not APT"}',
    '- Target: "Stripe" | Headline: "Senior SWE at Google | Ex-Stripe" -> {"currentlyWorksAtTarget": false, "isRelevantContact": false, "reason": "Former employee (Ex-Stripe), now at Google"}',
    '- Target: "Razorpay" | Headline: "Engineering Manager at Razorpay" | Snippet: "Engineering Manager at Razorpay · Present" -> {"currentlyWorksAtTarget": true, "isRelevantContact": true, "reason": "Current Engineering Manager at Razorpay"}',
    '',
    'Respond with JSON ONLY matching the required schema.',
  ].join('\n');

  const user = [
    `TARGET COMPANY: ${options.targetCompany}`,
    `TARGET DOMAIN: ${options.targetDomain ?? 'unknown'}`,
    `TARGET JOB ROLE: ${options.jobTitle}`,
    '',
    `CANDIDATE PERSON:`,
    `- Name: ${options.personName}`,
    `- Platform: ${options.platform}`,
    `- Profile URL: ${options.profileUrl}`,
    `- Headline / Bio: ${options.personHeadline}`,
    `- Raw Source Evidence: ${options.evidenceSnippet.slice(0, 700)}`,
  ].join('\n');

  const result = await ollamaChatJson<EmployeeVerificationDecision>({
    baseUrl: options.ollama.baseUrl,
    model: options.ollama.model,
    system,
    user,
    schema: EMPLOYEE_SCHEMA,
    timeoutMs: 60_000,
  });

  if (
    !result
    || typeof result.currentlyWorksAtTarget !== 'boolean'
    || typeof result.isRelevantContact !== 'boolean'
  ) {
    return null;
  }

  return {
    currentlyWorksAtTarget: result.currentlyWorksAtTarget,
    isRelevantContact: result.isRelevantContact,
    reason: typeof result.reason === 'string' ? result.reason.slice(0, 180) : 'Checked by local AI',
  };
}

/**
 * Second-stage verification for international (non-India) job listings using
 * qwen3.5:4b to catch subtle country locks, domestic-only relocation, or
 * local work-authorization barriers that regex alone can miss.
 */
export async function verifyInternationalEligibilityWithAi(options: {
  ollama: OllamaRuntimeOptions;
  jobTitle: string;
  companyName: string;
  locationText: string;
  sponsorshipNote: string | null;
  description: string;
  homeCountry: string;
}): Promise<InternationalJobDecision | null> {
  if (!options.ollama.enabled) return null;

  const system = [
    `You check whether an international job listing is genuinely open to an undergraduate student living in ${options.homeCountry}.`,
    'Follow these rules literally. When unsure, return eligibleFromIndia = false.',
    '',
    'ALLOW (eligibleFromIndia = true) ONLY in these 2 cases:',
    `1. mode = "wfh_from_india": The job is remote / work-from-home AND can be done from ${options.homeCountry} (e.g., Worldwide, Global Remote, Work from anywhere, APAC, or explicitly mentions ${options.homeCountry}).`,
    `2. mode = "relocation_from_india": The job is on-site or hybrid abroad AND explicitly offers international relocation support/assistance/package (and does NOT refuse visa sponsorship or require US/EU citizenship or pre-existing local work authorization).`,
    '',
    'REJECT (eligibleFromIndia = false, mode = "ineligible") if ANY of these apply:',
    '- Remote is restricted to another country/region (e.g., "Remote in USA", "Canada Remote", "UK/EU residents only", "must reside in US").',
    '- Relocation is domestic-only (e.g., "relocation within the US only", "no international relocation").',
    '- Visa sponsorship is refused, citizenship is required, or candidate must already hold work authorization in that foreign country.',
    '- On-site or hybrid abroad with NO clear mention of relocation support.',
    '',
    'Respond with JSON ONLY matching the required schema.',
  ].join('\n');

  const user = [
    `COMPANY: ${options.companyName}`,
    `JOB TITLE: ${options.jobTitle}`,
    `LOCATION: ${options.locationText || 'Not specified'}`,
    `SPONSORSHIP NOTE: ${options.sponsorshipNote || 'None'}`,
    '',
    `JOB DESCRIPTION EXCERPT:`,
    options.description.slice(0, 1800) || 'No description provided.',
  ].join('\n');

  const result = await ollamaChatJson<InternationalJobDecision>({
    baseUrl: options.ollama.baseUrl,
    model: options.ollama.model,
    system,
    user,
    schema: INTERNATIONAL_JOB_SCHEMA,
    timeoutMs: 60_000,
  });

  if (!result || typeof result.eligibleFromIndia !== 'boolean') return null;
  return {
    eligibleFromIndia: result.eligibleFromIndia,
    mode:
      result.mode === 'wfh_from_india' || result.mode === 'relocation_from_india'
        ? result.mode
        : 'ineligible',
    reason: typeof result.reason === 'string' ? result.reason.slice(0, 180) : 'Checked by local AI',
  };
}

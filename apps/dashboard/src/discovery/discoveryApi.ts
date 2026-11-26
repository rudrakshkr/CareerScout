import { request } from '../lib/api';

export interface DiscoverySummary {
  counts: {
    totalJobs: number;
    strongMatches: number;
    applicationsActive: number;
    companies: number;
    contacts: number;
    pendingDrafts: number;
    approvedDrafts: number;
  };
  activeRunId: string | null;
  latestRun: {
    id: string;
    mode: 'quick' | 'overnight';
    status: string;
    jobsScanned: number;
    jobsMatched: number;
    contactsFound: number;
    draftsCreated: number;
    startedAt: string | null;
    finishedAt: string | null;
  } | null;
  providers: {
    firecrawlConfigured: boolean;
    githubTokenConfigured?: boolean;
    ollamaConfigured: boolean;
    smtpConfigured?: boolean;
  };
}

export interface IntegrationsState {
  config: {
    firecrawlConfigured: boolean;
    githubTokenConfigured: boolean;
    ollamaBaseUrl: string;
    ollamaModel: string | null;
    smtpConfigured: boolean;
    smtpHost: string | null;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string | null;
    smtpFromName: string | null;
  };
  ollama: {
    reachable: boolean;
    baseUrl: string;
    models: string[];
    error: string | null;
  };
}

export interface DiscoveredJob {
  id: string;
  companyId: string | null;
  title: string;
  companyName: string;
  sourceName: string;
  sourceUrl: string;
  applyUrl: string | null;
  locationText: string | null;
  countryScope: 'national' | 'international' | 'remote_global' | 'unknown';
  workArrangement: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  employmentType: 'internship' | 'full_time' | 'part_time' | 'contract' | 'unknown';
  compensationStatus: 'paid' | 'unpaid' | 'unspecified';
  salaryText: string | null;
  description: string | null;
  matchedRoleTitle: string | null;
  matchScore: number;
  matchReasons: string[];
  matchedSkills: string[];
  verificationStatus: 'discovered' | 'needs_review' | 'verified_active' | 'expired' | 'rejected';
  applicationStatus: 'none' | 'saved' | 'preparing' | 'applied' | 'interviewing' | 'offer' | 'rejected';
  contactCount: number;
  draftCount: number;
  postedAt: string | null;
  discoveredAt: string;
}

export interface TailoredPack {
  jobTitle: string;
  companyName: string;
  tailoredHeadline: string;
  tailoredSummary: string;
  matchedSkills: string[];
  highlightedProjects: Array<{ name: string; reason: string; pitch: string; url: string | null }>;
  companyResearch: {
    summary: string | null;
    productFocus: string | null;
    sources: Array<{ title: string; url: string }>;
    externalResearchUsed: boolean;
  };
  coverLetter: string;
  wordCount: number;
  markdownExport: string;
  generatedWithAi: boolean;
}

export interface CompanyRecord {
  id: string;
  name: string;
  websiteUrl: string | null;
  careersUrl: string | null;
  atsProvider: string;
  headquarters: string | null;
  jobCount: number;
  contactCount: number;
  updatedAt: string;
}

export interface ContactRecord {
  id: string;
  companyId: string | null;
  jobId: string | null;
  companyName: string;
  fullName: string;
  roleTitle: string | null;
  contactType: 'recruiter' | 'hiring_manager' | 'engineer_referral' | 'founder' | 'talent_team' | 'other';
  email: string | null;
  profileUrl: string | null;
  platform: 'email' | 'linkedin' | 'github' | 'x' | 'company_site' | 'other';
  sourceUrl: string;
  sourceNote: string | null;
  confidence: 'verified' | 'likely' | 'search_lead';
  lastVerifiedAt: string;
}

export interface OutreachDraftRecord {
  id: string;
  jobId: string;
  contactId: string | null;
  companyName: string;
  roleTitle: string;
  channel: 'email' | 'linkedin_dm' | 'linkedin_note' | 'referral_request' | 'cover_letter' | 'other';
  recipientLabel: string;
  recipientTarget: string | null;
  targetKind: 'email' | 'person_profile' | 'job_posting' | 'none';
  jobSourceUrl: string | null;
  jobApplyUrl: string | null;
  subject: string | null;
  body: string;
  groundingFacts: string[];
  status: 'pending_review' | 'approved' | 'rejected' | 'sent_externally';
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchRunRecord {
  id: string;
  mode: 'quick' | 'overnight';
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  isLiveInProcess: boolean;
  jobsScanned: number;
  jobsMatched: number;
  contactsFound: number;
  draftsCreated: number;
  logs: Array<{ at: string; level: string; message: string }>;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface JobFilters {
  search?: string;
  workArrangement?: string;
  compensation?: string;
  scope?: string;
  employmentType?: string;
  recency?: string;
  applicationStatus?: string;
  minScore?: number;
  sort?: 'recent' | 'score';
}

export const discoveryApi = {
  summary: () => request<DiscoverySummary>('/api/discovery/summary'),
  getIntegrations: () => request<IntegrationsState>('/api/discovery/integrations'),
  saveIntegrations: (body: Record<string, unknown>) =>
    request<{ saved: true; config: IntegrationsState['config']; ollama: IntegrationsState['ollama'] }>(
      '/api/discovery/integrations',
      { method: 'PUT', body: JSON.stringify(body) },
    ),
  testFirecrawl: () => request<{ ok: true; sampleHits: number }>('/api/discovery/integrations/test-firecrawl', { method: 'POST', body: JSON.stringify({}) }),
  testSmtp: () => request<{ ok: true }>('/api/discovery/integrations/test-smtp', { method: 'POST', body: JSON.stringify({}) }),

  listJobs: (filters: JobFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.workArrangement && filters.workArrangement !== 'all') params.set('workArrangement', filters.workArrangement);
    if (filters.compensation && filters.compensation !== 'all') params.set('compensation', filters.compensation);
    if (filters.scope && filters.scope !== 'all') params.set('scope', filters.scope);
    if (filters.employmentType && filters.employmentType !== 'all') params.set('employmentType', filters.employmentType);
    if (filters.recency && filters.recency !== 'all') params.set('recency', filters.recency);
    if (filters.applicationStatus && filters.applicationStatus !== 'all') params.set('applicationStatus', filters.applicationStatus);
    if (filters.minScore) params.set('minScore', String(filters.minScore));
    if (filters.sort) params.set('sort', filters.sort);
    const qs = params.toString();
    return request<{ jobs: DiscoveredJob[] }>(`/api/discovery/jobs${qs ? `?${qs}` : ''}`);
  },

  importJob: (body: {
    title: string;
    companyName: string;
    sourceUrl: string;
    locationText?: string;
    salaryText?: string;
    description?: string;
    generateDrafts?: boolean;
  }) => request<{ imported: true; jobId: string | null; contactsAdded: number; draftsAdded: number }>('/api/discovery/jobs/import', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  updateJob: (id: string, body: { applicationStatus?: string; verificationStatus?: string }) =>
    request<{ saved: true }>(`/api/discovery/jobs/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteJob: (id: string) =>
    request<void>(`/api/discovery/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  tailorJob: (id: string, options: { useLocalOllama?: boolean; researchCompany?: boolean } = {}) =>
    request<{ pack: TailoredPack }>(`/api/discovery/jobs/${encodeURIComponent(id)}/tailor`, {
      method: 'POST',
      body: JSON.stringify(options),
    }),

  saveCoverLetter: (id: string, body: { coverLetter: string; groundingFacts?: string[] }) =>
    request<{ draftId: string }>(`/api/discovery/jobs/${encodeURIComponent(id)}/save-cover-letter`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  generateDraftsForJob: (id: string) =>
    request<{ created: number; contactsCount: number; newContactsAdded: number; firecrawlUsed: boolean }>(
      `/api/discovery/jobs/${encodeURIComponent(id)}/generate-drafts`,
      { method: 'POST', body: JSON.stringify({}) },
    ),

  listCompanies: () => request<{ companies: CompanyRecord[] }>('/api/discovery/companies'),

  listContacts: (filters: { search?: string; confidence?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.confidence && filters.confidence !== 'all') params.set('confidence', filters.confidence);
    const qs = params.toString();
    return request<{ contacts: ContactRecord[] }>(`/api/discovery/contacts${qs ? `?${qs}` : ''}`);
  },

  createContact: (body: {
    companyName: string;
    fullName: string;
    roleTitle?: string;
    email?: string;
    profileUrl?: string;
    sourceUrl?: string;
    sourceNote?: string;
    contactType?: string;
    platform?: string;
  }) => request<{ id: string }>('/api/discovery/contacts', { method: 'POST', body: JSON.stringify(body) }),

  listDrafts: (filters: { status?: string; channel?: string; jobId?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.channel && filters.channel !== 'all') params.set('channel', filters.channel);
    if (filters.jobId) params.set('jobId', filters.jobId);
    const qs = params.toString();
    return request<{ drafts: OutreachDraftRecord[] }>(`/api/discovery/drafts${qs ? `?${qs}` : ''}`);
  },

  updateDraft: (
    id: string,
    body: Partial<{
      subject: string | null;
      body: string;
      recipientLabel: string;
      recipientTarget: string | null;
      status: 'pending_review' | 'approved' | 'rejected' | 'sent_externally';
    }>,
  ) => request<{ draft: OutreachDraftRecord | null }>(`/api/discovery/drafts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }),

  sendDraftEmail: (id: string, body: { recipientEmail?: string; attachPrimaryResume?: boolean }) =>
    request<{ sent: true; messageId: string; attachedFilename: string | null }>(
      `/api/discovery/drafts/${encodeURIComponent(id)}/send-email`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  listRuns: () => request<{ runs: ResearchRunRecord[] }>('/api/discovery/runs'),

  startRun: (body: {
    mode: 'quick' | 'overnight';
    maxDurationMinutes?: number;
    maxJobsToSave?: number;
    includeInternational?: boolean;
    includeNational?: boolean;
    generateDrafts?: boolean;
    firecrawlCreditBudget?: number;
    useLocalOllama?: boolean;
    customBoards?: Array<{ provider: 'greenhouse' | 'lever' | 'ashby'; token: string; companyName: string }>;
  }) => request<{ runId: string; alreadyRunning: boolean }>('/api/discovery/runs', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  stopRun: (id: string) =>
    request<{ stopping: true }>(`/api/discovery/runs/${encodeURIComponent(id)}/stop`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
};

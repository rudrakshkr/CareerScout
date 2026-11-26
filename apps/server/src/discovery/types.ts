export type CountryScope = 'national' | 'international' | 'remote_global' | 'unknown';
export type JobWorkArrangement = 'remote' | 'hybrid' | 'onsite' | 'unknown';
export type JobEmploymentType = 'internship' | 'full_time' | 'part_time' | 'contract' | 'unknown';
export type CompensationStatus = 'paid' | 'unpaid' | 'unspecified';

export interface RawDiscoveredJob {
  sourceName: string;
  sourceUrl: string;
  applyUrl?: string | null;
  title: string;
  companyName: string;
  companyWebsite?: string | null;
  careersUrl?: string | null;
  atsProvider?: 'greenhouse' | 'lever' | 'ashby' | 'direct' | 'other';
  atsBoardToken?: string | null;
  locationText?: string | null;
  salaryText?: string | null;
  description?: string | null;
  postedAt?: Date | null;
  tags?: string[];
  explicitEmploymentType?: JobEmploymentType | null;
  explicitWorkArrangement?: JobWorkArrangement | null;
  sponsorshipNote?: string | null;
  rawContactHint?: {
    name?: string | null;
    email?: string | null;
    roleTitle?: string | null;
    profileUrl?: string | null;
    note?: string | null;
  } | null;
}

export interface UserProfileContext {
  userId: string;
  displayName: string;
  email: string;
  currentTitle: string | null;
  headline: string | null;
  locationCity: string | null;
  locationCountry: string | null;
  portfolioUrl: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  skills: Array<{ name: string; category: string; isHighlighted: boolean }>;
  projects: Array<{
    name: string;
    tagline: string | null;
    description: string | null;
    projectUrl: string | null;
    repositoryUrl: string | null;
    technologies: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string | null;
    fieldOfStudy: string | null;
    graduationYear: number | null;
    isCurrent: boolean;
  }>;
  experience: Array<{
    companyName: string;
    jobTitle: string;
    employmentType: string | null;
  }>;
  preferredRoles: Array<{
    title: string;
    category: string | null;
    seniority: string;
    priority: number;
  }>;
  preferredLocations: Array<{
    city: string | null;
    region: string | null;
    country: string;
    priority: number;
  }>;
  preferences: {
    minimumSalary: number | null;
    maximumSalary: number | null;
    salaryCurrency: string | null;
    salaryPeriod: string | null;
    paidPreference: string;
    workArrangement: string;
    willingToRelocate: boolean;
  } | null;
}

export interface EvaluatedJob {
  accepted: boolean;
  rejectionReason: string | null;
  fingerprint: string;
  matchedRoleTitle: string | null;
  matchScore: number;
  matchReasons: string[];
  matchedSkills: string[];
  missingSkills: string[];
  countryScope: CountryScope;
  workArrangement: JobWorkArrangement;
  employmentType: JobEmploymentType;
  compensationStatus: CompensationStatus;
  verificationStatus: 'discovered' | 'needs_review' | 'verified_active';
}

export interface DiscoveryRunConfig {
  mode: 'quick' | 'overnight';
  maxDurationMinutes: number;
  maxJobsToSave: number;
  includeInternational: boolean;
  includeNational: boolean;
  generateDrafts: boolean;
  firecrawlCreditBudget: number;
  useLocalOllama: boolean;
  customBoards?: Array<{ provider: 'greenhouse' | 'lever' | 'ashby'; token: string; companyName: string }>;
}

export interface RunLogEntry {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

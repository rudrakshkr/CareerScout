import { request, type ApiProfile, type ApiUser } from '../lib/api';

export interface EducationEntry {
  id: string;
  institution: string;
  educationLevel: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
  graduationYear: number | null;
  grade: string | null;
  description: string | null;
  isCurrent: boolean;
  sortOrder: number;
}

export interface ExperienceEntry {
  id: string;
  companyName: string;
  jobTitle: string;
  employmentType: string | null;
  location: string | null;
  workArrangement: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  achievements: string | null;
  sortOrder: number;
}

export interface ProjectEntry {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  role: string | null;
  projectUrl: string | null;
  repositoryUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  isOngoing: boolean;
  sortOrder: number;
  technologies: Array<{ id: string; name: string; sortOrder: number }>;
}

export interface SkillEntry {
  id: string;
  name: string;
  category: string;
  proficiency: string | null;
  yearsExperience: number | null;
  isHighlighted: boolean;
  sortOrder: number;
}

export interface JobPreferences {
  minimumSalary: number | null;
  maximumSalary: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  paidPreference: string;
  workArrangement: string;
  willingToRelocate: boolean;
}

export interface PreferredRole {
  id: string;
  title: string;
  category: string | null;
  seniority: string;
  priority: number;
}

export interface PreferredLocation {
  id: string;
  city: string | null;
  region: string | null;
  country: string;
  priority: number;
}

export interface ResumeSummary {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  isPrimary: boolean;
  processingStatus: string;
  uploadedAt: string;
  updatedAt: string;
}

export interface OnboardingProfile extends ApiProfile {
  onboardingStatus: 'not_started' | 'in_progress' | 'completed';
  onboardingCurrentStep: 'personal' | 'education' | 'experience' | 'projects' | 'skills' | 'preferences' | 'resume';
  onboardingCompletedAt: string | null;
}

export interface OnboardingData {
  user: ApiUser;
  profile: OnboardingProfile;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  skills: SkillEntry[];
  preferences: JobPreferences | null;
  preferredRoles: PreferredRole[];
  preferredLocations: PreferredLocation[];
  resumes: ResumeSummary[];
}

export interface EducationInput {
  institution: string;
  educationLevel: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
  graduationYear: number | null;
  grade: string | null;
  description: string | null;
  isCurrent: boolean;
  sortOrder: number;
}

export interface ExperienceInput {
  companyName: string;
  jobTitle: string;
  employmentType: string | null;
  location: string | null;
  workArrangement: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  achievements: string | null;
  sortOrder: number;
}

export interface ProjectInput {
  name: string;
  tagline: string | null;
  description: string | null;
  role: string | null;
  projectUrl: string | null;
  repositoryUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  isOngoing: boolean;
  sortOrder: number;
  technologies: string[];
}

export interface SkillInput {
  name: string;
  category: string;
  proficiency: string | null;
  yearsExperience: number | null;
  isHighlighted: boolean;
  sortOrder: number;
}

export interface PreferencesInput {
  minimumSalary: number | null;
  maximumSalary: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  paidPreference: string;
  workArrangement: string;
  willingToRelocate: boolean;
  roles: Array<{ title: string; category: string | null; seniority: string; priority: number }>;
  locations: Array<{ city: string | null; region: string | null; country: string; priority: number }>;
}

export const onboardingApi = {
  get: () => request<OnboardingData>('/api/profile'),
  patchPersonal: (body: {
    displayName: string;
    phone: string | null;
    locationCity: string | null;
    locationCountry: string | null;
    headline: string | null;
    portfolioUrl: string | null;
    linkedinUrl: string | null;
    githubUrl: string | null;
    currentTitle: string | null;
  }) => request<{ user: ApiUser; profile: OnboardingProfile }>('/api/profile/personal', {
    method: 'PATCH', body: JSON.stringify(body),
  }),
  createEducation: (body: EducationInput) => request<{ entry: EducationEntry }>('/api/profile/education', {
    method: 'POST', body: JSON.stringify(body),
  }),
  updateEducation: (id: string, body: Partial<EducationInput>) => request<{ entry: EducationEntry }>(`/api/profile/education/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(body),
  }),
  deleteEducation: (id: string) => request<void>(`/api/profile/education/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createExperience: (body: ExperienceInput) => request<{ entry: ExperienceEntry }>('/api/profile/experience', {
    method: 'POST', body: JSON.stringify(body),
  }),
  updateExperience: (id: string, body: Partial<ExperienceInput>) => request<{ entry: ExperienceEntry }>(`/api/profile/experience/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(body),
  }),
  deleteExperience: (id: string) => request<void>(`/api/profile/experience/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createProject: (body: ProjectInput) => request<{ entry: ProjectEntry }>('/api/profile/projects', {
    method: 'POST', body: JSON.stringify(body),
  }),
  updateProject: (id: string, body: Partial<ProjectInput>) => request<{ entry: ProjectEntry }>(`/api/profile/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(body),
  }),
  deleteProject: (id: string) => request<void>(`/api/profile/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createSkill: (body: SkillInput) => request<{ entry: SkillEntry }>('/api/profile/skills', {
    method: 'POST', body: JSON.stringify(body),
  }),
  updateSkill: (id: string, body: Partial<SkillInput>) => request<{ entry: SkillEntry }>(`/api/profile/skills/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(body),
  }),
  deleteSkill: (id: string) => request<void>(`/api/profile/skills/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  savePreferences: (body: PreferencesInput) => request<{ saved: boolean }>('/api/profile/preferences', {
    method: 'PUT', body: JSON.stringify(body),
  }),
  saveStep: (currentStep: OnboardingProfile['onboardingCurrentStep']) => request<{ profile: OnboardingProfile }>('/api/profile/onboarding', {
    method: 'PATCH', body: JSON.stringify({ currentStep }),
  }),
  complete: () => request<{ completed: true; profile: OnboardingProfile; missingRequirements: [] }>('/api/profile/onboarding/complete', {
    method: 'POST', body: JSON.stringify({}),
  }),
};

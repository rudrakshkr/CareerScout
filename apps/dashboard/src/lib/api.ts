export interface ApiUser {
  id: string;
  email: string;
  displayName: string;
  createdAt?: string;
}

export interface ApiProfile {
  userId: string;
  phone: string | null;
  locationCity: string | null;
  locationCountry: string | null;
  headline: string | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  currentTitle: string | null;
  educationLevel: string | null;
  institution: string | null;
  graduationYear: number | null;
  createdAt: string;
  updatedAt: string;
  onboardingStatus?: 'not_started' | 'in_progress' | 'completed';
  onboardingCurrentStep?: 'personal' | 'education' | 'experience' | 'projects' | 'skills' | 'preferences' | 'resume';
  onboardingCompletedAt?: string | null;
}

interface UserResponse {
  user: ApiUser;
}

export interface MeResponse extends UserResponse {
  profile: ApiProfile | null;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  } catch {
    throw new ApiError('Cannot reach the local CareerScout API. Make sure the server is running.', 0);
  }

  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload &&
      typeof payload.error === 'string'
      ? payload.error
      : `Request failed with status ${response.status}.`;
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

export const authApi = {
  me: () => request<MeResponse>('/api/auth/me'),
  login: (email: string, password: string) => request<UserResponse>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  }),
  register: (displayName: string, email: string, password: string) => request<UserResponse>('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ displayName, email, password }),
  }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
};

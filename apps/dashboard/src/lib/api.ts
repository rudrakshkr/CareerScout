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

function extractFieldDetails(payload: Record<string, unknown>): string[] {
  const details: string[] = [];
  const candidateKeys = ['fields', 'fieldErrors', 'details', 'errors', 'issues'] as const;

  for (const key of candidateKeys) {
    const raw = payload[key];
    if (!raw) continue;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === 'string' && item.trim()) {
          details.push(item.trim());
        } else if (typeof item === 'object' && item !== null) {
          const rec = item as Record<string, unknown>;
          const field = typeof rec.field === 'string' ? rec.field : typeof rec.path === 'string' ? rec.path : '';
          const msg = typeof rec.message === 'string' ? rec.message : typeof rec.error === 'string' ? rec.error : '';
          if (field && msg) details.push(`${field}: ${msg}`);
          else if (msg) details.push(msg);
        }
      }
    } else if (typeof raw === 'object') {
      for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === 'string' && value.trim()) {
          details.push(`${field}: ${value.trim()}`);
        } else if (Array.isArray(value)) {
          const text = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).join(', ');
          if (text) details.push(`${field}: ${text}`);
        }
      }
    }
  }
  return details;
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
    let message = `Request failed with status ${response.status}.`;
    if (typeof payload === 'object' && payload !== null) {
      const record = payload as Record<string, unknown>;
      if (typeof record.error === 'string' && record.error.trim()) {
        message = record.error.trim();
      }
      const fieldDetails = extractFieldDetails(record);
      if (fieldDetails.length > 0) {
        message = `${message} (${fieldDetails.slice(0, 4).join('; ')})`;
      }
    }
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

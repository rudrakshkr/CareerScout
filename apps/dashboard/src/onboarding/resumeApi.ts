export interface ResumeRecord {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  isPrimary: boolean;
  processingStatus: 'uploaded' | 'queued' | 'processing' | 'needs_review' | 'verified' | 'failed';
  processingError: string | null;
  hasExtractedText: boolean;
  uploadedAt: string;
  updatedAt: string;
}

interface ResumeListResponse {
  resumes: ResumeRecord[];
}

interface ResumeMutationResponse {
  saved?: boolean;
}

async function parseError(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string') {
    return payload.error;
  }
  return `Request failed with status ${response.status}.`;
}

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: 'same-origin' });
  } catch {
    throw new Error('Cannot reach the local CareerScout API. Make sure the server is running.');
  }

  if (response.status === 204) return undefined as T;
  if (!response.ok) throw new Error(await parseError(response));
  return await response.json() as T;
}

export const resumeApi = {
  list: () => jsonRequest<ResumeListResponse>('/api/resumes'),

  upload: (file: File) => {
    const form = new FormData();
    form.append('resume', file);
    return jsonRequest<{ resume: Pick<ResumeRecord, 'id' | 'originalFilename' | 'mimeType' | 'fileSizeBytes' | 'isPrimary' | 'processingStatus' | 'processingError' | 'hasExtractedText' | 'uploadedAt'> }>('/api/resumes', {
      method: 'POST',
      body: form,
    });
  },

  setPrimary: (id: string) => jsonRequest<ResumeMutationResponse>(`/api/resumes/${encodeURIComponent(id)}/primary`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }),

  remove: (id: string) => jsonRequest<void>(`/api/resumes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }),

  readText: async (id: string, refresh = false): Promise<string> => {
    let response: Response;
    try {
      const query = refresh ? '?refresh=1' : '';
      response = await fetch(`/api/resumes/${encodeURIComponent(id)}/text${query}`, { credentials: 'same-origin' });
    } catch {
      throw new Error('Cannot reach the local CareerScout API. Make sure the server is running.');
    }
    if (!response.ok) throw new Error(await parseError(response));
    return response.text();
  },

  downloadUrl: (id: string) => `/api/resumes/${encodeURIComponent(id)}/download`,
};

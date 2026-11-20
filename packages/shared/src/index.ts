export interface ApiHealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

export type ResearchRunStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type JobVerificationStatus =
  | 'discovered'
  | 'needs_review'
  | 'verified_active'
  | 'expired'
  | 'rejected';

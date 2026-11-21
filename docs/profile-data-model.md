# CareerScout profile and onboarding data model

All profile records are owned by an authenticated user. Child records reference `users.id` with `ON DELETE CASCADE`; API handlers must obtain the owner ID from the authenticated session, never from request payloads.

## Tables

- `profiles`: core contact and professional links plus resumable onboarding status. The original single-education fields remain temporarily for compatibility; `education_entries` is the source of truth for multiple qualifications.
- `education_entries`: one row per qualification.
- `experience_entries`: internships, employment, freelance and volunteer history.
- `projects`: portfolio and personal projects.
- `project_technologies`: normalized technologies attached to projects.
- `user_skills`: user-level skills, category and optional proficiency/experience.
- `job_preferences`: one row per user for salary, compensation, work arrangement and relocation preferences.
- `preferred_roles`: one or more target roles, seniority and priority.
- `preferred_locations`: one or more preferred locations and priority.
- `resume_documents`: metadata and private storage keys only; resume bytes and extracted text are kept outside SQLite in per-user local storage.

## Onboarding persistence

`profiles.onboardingStatus` is `not_started`, `in_progress` or `completed`. `onboardingCurrentStep` stores one of `personal`, `education`, `experience`, `projects`, `skills`, `preferences` or `resume`. Each wizard step must save independently so users can resume later.

## Security requirements

- Derive `userId` from the authenticated session for every read/write.
- Never accept a client-provided `userId` as authorization.
- Validate URLs, dates, salary ranges, file MIME type, extension, actual file signature and file size at the API boundary.
- Store resume files outside the web root using generated storage keys; never use the original filename as a filesystem path.
- Treat resume extraction as untrusted data. AI-extracted facts remain unverified until the user reviews them.

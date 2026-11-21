# CareerScout Profile API

All endpoints below are authenticated by the existing `career_scout_session` cookie. The server derives the owner from the authenticated session; clients must not send a `userId` to choose whose records are read or changed.

All responses use `Cache-Control: no-store`.

## Profile snapshot

- `GET /api/profile`
  - Returns the signed-in user, personal profile, education, experience, projects (including technologies), skills, job preferences, preferred roles, preferred locations, and resume metadata.
  - Resume storage keys, file hashes, and extracted file contents are not returned.

## Personal details

- `PATCH /api/profile/personal`
  - Accepts any subset of `displayName`, `phone`, `locationCity`, `locationCountry`, `headline`, `portfolioUrl`, `linkedinUrl`, `githubUrl`, and `currentTitle`.
  - URLs must use HTTP or HTTPS.

## Education

- `POST /api/profile/education`
- `PATCH /api/profile/education/:id`
- `DELETE /api/profile/education/:id`

Required on creation: `institution`. Other fields: `educationLevel`, `degree`, `fieldOfStudy`, `startDate`, `endDate`, `graduationYear`, `grade`, `description`, `isCurrent`, and `sortOrder`.

## Experience

- `POST /api/profile/experience`
- `PATCH /api/profile/experience/:id`
- `DELETE /api/profile/experience/:id`

Required on creation: `companyName` and `jobTitle`. Other fields: `employmentType`, `location`, `workArrangement`, `startDate`, `endDate`, `isCurrent`, `description`, `achievements`, and `sortOrder`.

## Projects and technologies

- `POST /api/profile/projects`
- `PATCH /api/profile/projects/:id`
- `DELETE /api/profile/projects/:id`

Required on creation: `name`. Other fields: `tagline`, `description`, `role`, `projectUrl`, `repositoryUrl`, `startDate`, `endDate`, `isOngoing`, `sortOrder`, and `technologies` (an array of strings). When `technologies` is included in an update, it replaces that project's technology list transactionally.

## Skills

- `POST /api/profile/skills`
- `PATCH /api/profile/skills/:id`
- `DELETE /api/profile/skills/:id`

Required on creation: `name`. Other fields: `category`, `proficiency`, `yearsExperience`, `isHighlighted`, and `sortOrder`. Skill names are checked case-insensitively for duplicates within the current user.

## Job preferences

- `PUT /api/profile/preferences`
  - Accepts `minimumSalary`, `maximumSalary`, `salaryCurrency`, `salaryPeriod`, `paidPreference`, `workArrangement`, and `willingToRelocate`.
  - Optional `roles` and `locations` arrays replace the current corresponding lists when supplied. Omitting either array preserves that list.
  - Preference and supplied list changes are committed in one database transaction.

## Onboarding progress

- `PATCH /api/profile/onboarding`
  - Accepts `currentStep`: `personal`, `education`, `experience`, `projects`, `skills`, `preferences`, or `resume`.
  - Moves an incomplete onboarding profile to `in_progress`. It does not mark onboarding complete; completion criteria will be implemented alongside the wizard.

## Error behavior

- `400`: invalid or missing fields.
- `401`: no valid session.
- `404`: record does not exist for the authenticated user.
- `409`: duplicate skill name.
- `204`: successful deletion.

Resume binary upload, parsing, storage cleanup, primary-resume selection and extraction review are intentionally not part of this API slice. They will be implemented separately with file-size/type validation and user-scoped local storage.

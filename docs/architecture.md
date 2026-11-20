# Initial architecture

## Product boundary

CareerScout is a local-first application. The dashboard, API, database, personal files, and local model runtime should run on the user's computer. External providers (for example Firecrawl, YouTube Data API, job-board APIs, and optional email integrations) are accessed through replaceable adapters.

## Initial workspace layout

- `apps/dashboard`: React + TypeScript + Vite UI.
- `apps/server`: Express API bound to `127.0.0.1` by default.
- `packages/shared`: shared TypeScript contracts.
- `docs`: architecture, operating notes, and design decisions.

## Planned bounded modules

- Identity and onboarding
- User profile and verified resume facts
- Job source registry and source connectors
- Search orchestration and persistent research queue
- Job normalization, deduplication, verification, and matching
- Company intelligence and contact evidence
- Resume and application-document generation
- Outreach drafting and approval workflow
- Local scheduler, logs, and API usage budgets

These modules are planned boundaries, not implemented features yet.

## Data separation

Every user-owned record must carry a user/workspace ownership reference. Database access must scope reads and writes to the authenticated local user. API keys and personal files must not be placed in source control. Runtime data will live in the ignored `data/` directory.

## Source evidence

Jobs, companies, and contacts should preserve source URLs, retrieval timestamps, and verification state. Do not infer a missing salary, deadline, contact email, or hiring relationship. Store uncertainty explicitly.

## Human approval

Generating a draft is not permission to send it. Sending a message or submitting an application must require a deliberate user action and a clear review step.

## Local network boundary

The initial API binds to `127.0.0.1`, not `0.0.0.0`, and the Vite dev server proxies `/api` calls to it. Do not expose the local API to a network until authentication, CSRF/origin protections, and access controls have been implemented and reviewed.

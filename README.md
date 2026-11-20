# CareerScout

A local-first, multi-user AI job discovery and application research assistant.

CareerScout is designed to discover relevant vacancies from a broad range of permitted sources, evaluate them against an individual's profile, research companies and publicly documented hiring contacts, and prepare tailored application materials. Applications and outreach remain human-approved actions.

## Current status

This repository is at the foundation stage. The initial workspace contains a React dashboard, a local Express API, shared types, and architecture notes. Job collectors, authentication, persistence, AI workflows, and application generation are planned but are not implemented yet.

## Requirements

- Node.js 24 or newer (Node.js 22.12+ is the minimum supported by this project setup)
- npm 11 or a compatible recent npm release

## Run locally

```bash
npm install
npm run dev
```

- Dashboard: <http://127.0.0.1:5173>
- Local API health check: <http://127.0.0.1:3001/api/health>

The Vite development server proxies `/api` requests to the local API.

## Workspaces

- `apps/dashboard` — React + TypeScript + Vite user interface
- `apps/server` — Node.js + Express local API
- `packages/shared` — shared TypeScript contracts
- `docs` — architecture and design decisions

## Local data and privacy

Personal profiles, resumes, application documents, databases, logs, and API credentials must remain outside version control. Runtime data belongs in the ignored `data/` directory. Never commit `.env` files or personal documents.

## Product principles

1. Local-first by default; external services are optional providers.
2. Every user has separate profile, preferences, documents, contacts, and application history.
3. Job and contact claims retain source evidence; unknown values remain unknown.
4. Use source-approved APIs, feeds, alerts, and public-page access. Do not bypass access controls or website restrictions.
5. Do not send messages or submit applications without explicit human approval.
6. Track external API usage and enforce configurable budgets.

See [`docs/architecture.md`](docs/architecture.md) for the initial system boundaries and [`docs/design-references.md`](docs/design-references.md) for dashboard inspiration.

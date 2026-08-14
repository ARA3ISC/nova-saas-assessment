# NOVA — Phase 0 Scaffold

TypeScript monorepo for the NOVA SaaS technical assessment. This repository currently contains project scaffolding and the development harness only. Domain, security, and business features are implemented in later phases.

Assessment specifications live in the sibling `assessement/` directory and are not modified by this implementation.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL 15+ (required once database migrations are introduced; not required for the current health-only API)

## Installation

```bash
npm install
```

This installs workspace dependencies and builds the shared package.

## Environment setup

Copy the example environment file and adjust values for your machine:

```bash
cp .env.example .env
```

Required variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string for Prisma (`apps/api`) |
| `API_HOST` | API bind host (default `127.0.0.1`) |
| `API_PORT` | API port (default `3001`) |
| `WEB_PORT` | Next.js port (default `3000`) |
| `NEXT_PUBLIC_API_URL` | Public API base URL for future web integration |

No secrets are committed to the repository.

## Local development

Start the web and API applications together:

```bash
npm run dev
```

Or run them independently:

```bash
npm run dev -w @nova/web
npm run dev -w @nova/api
```

Endpoints:

- Web: [http://127.0.0.1:3000](http://127.0.0.1:3000)
- API health: [http://127.0.0.1:3001/health](http://127.0.0.1:3001/health)

## Available scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start web and API in watch mode |
| `npm run build` | Build shared, API, and web packages |
| `npm run lint` | Run ESLint across the monorepo |
| `npm run typecheck` | Run TypeScript checks in all workspaces |
| `npm run test` | Run Vitest unit tests |
| `npm run test:e2e` | Run Playwright smoke tests (build required first) |
| `npm run format` | Format files with Prettier |
| `npm run format:check` | Check Prettier formatting |

Prisma commands (API workspace):

```bash
npm run prisma:generate -w @nova/api
npm run prisma:migrate -w @nova/api
```

## Repository layout

```text
apps/
  web/          Next.js web application
  api/          NestJS API and Prisma schema
packages/
  shared/       Minimal shared utilities
tests/
  e2e/          Playwright end-to-end smoke tests
.github/
  workflows/    Continuous integration
```

## Testing notes

- Unit tests use Vitest.
- End-to-end smoke tests use Playwright and expect production builds via `npm run build` before `npm run test:e2e`.
- Install Playwright browsers once before the first E2E run: `npx playwright install chromium`
- PostgreSQL integration and RLS verification CI will be added in a later phase.

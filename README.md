# NOVA — SaaS Foundation Assessment

TypeScript monorepo for the NOVA SaaS technical assessment. It contains the current implementation of first-party authentication, tenant isolation, platform provisioning, invitation activation, transactional email, organization administration, and the responsive administration shell.

Assessment specifications live in the sibling `assessement/` directory and are not modified by this implementation.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL 17 (used in CI; PostgreSQL 15+ is compatible for local development)

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

| Variable                      | Purpose                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`                | PostgreSQL connection string for Prisma (`apps/api`)                    |
| `API_HOST`                    | API bind host (default `127.0.0.1`)                                     |
| `API_PORT`                    | API port (default `3001`)                                               |
| `WEB_PORT`                    | Next.js port (default `3000`)                                           |
| `NEXT_PUBLIC_API_URL`         | Public API base URL for future web integration                          |
| `RESEND_API_KEY`              | Server-only Resend API key for transactional email                      |
| `RESEND_SENDER`               | Verified Resend sender, e.g. `NOVA <noreply@your-domain>`               |
| `PUBLIC_APP_ORIGIN`           | Allowlisted web origin used to build invitation links                   |
| `EMAIL_ENCRYPTION_KEY`        | Base64-encoded 32-byte key for short-lived queued email envelopes       |
| `PLATFORM_BOOTSTRAP_TOKEN`    | One-time Platform bootstrap secret                                      |
| `PLATFORM_BOOTSTRAP_EMAIL`    | Initial Platform Administrator email, used only by the bootstrap CLI    |
| `PLATFORM_BOOTSTRAP_PASSWORD` | Initial Platform Administrator password, used only by the bootstrap CLI |

No secrets are committed to the repository.

### Transactional email

Provisioning writes the initial-owner invitation and its encrypted delivery envelope in one database transaction. The API then dispatches the allowlisted initial-owner template through Resend using a stable delivery identifier. Configure a verified sender/domain in Resend and use a mailbox you control for the required end-to-end demonstration. Automated tests use the same outbound transport port through a deterministic recording sender and never call Resend.

Generate an envelope key locally with:

```bash
openssl rand -base64 32
```

### Database and Platform bootstrap

Apply the additive Prisma migrations, then create the initial Platform
Administrator exactly once from secret environment variables:

```bash
npm run prisma:migrate -w @nova/api
npm run platform:bootstrap -w @nova/api
```

The command refuses to overwrite an existing Platform Administrator. Remove the
bootstrap credential variables after successful provisioning.

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

Primary endpoints:

- Web: [http://127.0.0.1:3000](http://127.0.0.1:3000)
- API health: [http://127.0.0.1:3001/health](http://127.0.0.1:3001/health)
- Platform bootstrap: `POST /platform/bootstrap`
- Password reset: `POST /password-reset/request`, `POST /password-reset/complete`

For plain local HTTP on either `localhost` or `127.0.0.1`, leave
`NODE_ENV` unset/development so the API uses development-only session cookies.
Production uses the required `Secure`, host-only `__Host-nova_session` cookie.

### Authentication and session lifecycle

NOVA normalizes email addresses before lookup and stores passwords with Argon2id. Login is
protected by account/source throttling. Successful authentication creates an opaque, hashed,
server-side session; the browser receives only an HttpOnly, SameSite session cookie and a separate
CSRF cookie. Sessions have idle and absolute expiry, logout revokes the current session, and access
epoch checks immediately reject an already-open session after membership suspension, removal, or a
permission reduction. Privileged mutations additionally require recent authentication.

Tenant operations run inside a transaction that first downgrades to the non-superuser `nova_app`
database role and then installs transaction-local Organization, actor, and access-epoch context.
This makes forced RLS effective even if the underlying connection was opened by the migration owner;
missing context fails closed. Global Platform queries remain separate from these tenant transactions.

Initial owners and collaborators create credentials only through hashed, single-use invitation
links. There is no public Organization registration endpoint. Password recovery always returns the
same neutral request response. Eligible Organization identities and the Platform Administrator
receive an allowlisted Resend link containing a hashed, single-use token that expires after 30
minutes. Successful completion updates the Argon2id credential and revokes every existing session.

## Available scripts

| Script                 | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | Start web and API in watch mode                   |
| `npm run build`        | Build shared, API, and web packages               |
| `npm run lint`         | Run ESLint across the monorepo                    |
| `npm run typecheck`    | Run TypeScript checks in all workspaces           |
| `npm run test`         | Run Vitest unit tests                             |
| `npm run test:e2e`     | Run Playwright smoke tests (build required first) |
| `npm run format`       | Format files with Prettier                        |
| `npm run format:check` | Check Prettier formatting                         |

Prisma commands (API workspace):

```bash
npm run prisma:generate -w @nova/api
npm run prisma:migrate -w @nova/api
npm run prisma:seed -w @nova/api
npm run platform:bootstrap -w @nova/api
```

The synthetic seed creates two isolated demo Organizations: `Atlas Demo Group` and `Northstar Demo Group`. Owner accounts are `atlas.owner@example.test` and `northstar.owner@example.test`. It also creates the least-privilege `atlas.user@example.test` with explicit read grants only for Atlas Hospitality and Atlas Restaurant. All three accounts use the documented synthetic development password `Synthetic demo password 2026`; never use it outside local development.

CI separately exercises the real one-time bootstrap command to create the synthetic `platform.admin@example.test` Platform Administrator with the same development-only password. Local environments should run the documented bootstrap command once with their own `.env` values; the ordinary Prisma seed never creates or overwrites a Platform principal.

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

## Architecture and trade-offs

- **Modular monolith:** NestJS modules own authentication, access, invitations, notifications,
  Organization administration, and Platform administration. This keeps transaction boundaries
  explicit without introducing distributed coordination for an assessment-sized system.
- **Database-enforced tenancy:** authoritative Organization context comes from the authenticated
  membership, never request input. Tenant callbacks use one PostgreSQL transaction, downgrade to
  `nova_app`, install transaction-local context, and rely on forced RLS plus composite foreign keys.
  Global Platform operations stay outside tenant transactions and expose minimized, purpose-built
  queries rather than a general bypass.
- **Immediate stale-access refusal:** memberships carry an access epoch. Sensitive access changes
  increment it and revoke sessions; tenant transactions recheck it before commit. This favors
  server-side correctness over optional real-time browser notifications.
- **First-party authentication:** opaque session credentials are hashed in PostgreSQL and delivered
  only through HttpOnly cookies. Argon2id password credentials, CSRF protection, recent-auth gates,
  throttling, absolute/idle expiry, and single-use recovery credentials form the authentication
  boundary.
- **Transactional email outbox:** business transactions persist an encrypted, allowlisted delivery
  envelope with their state change. Delivery is attempted after commit and retried in bounded
  batches with a stable idempotency key. A separate queue was intentionally avoided; a dedicated
  worker would be the natural scale-out step.
- **Append-only evidence:** sensitive lifecycle, permission, promotion, demotion, ownership, and
  Platform intervention actions store actor, reason, subject, and before/after evidence. Database
  policy prevents tenant-side mutation of prior evidence.
- **Explicit grants, not extra roles:** `Administrator` and `User` are the only Organization
  profiles. Presets are immutable versioned conveniences that resolve to concrete capability and
  scope grants, avoiding hidden authorization semantics.

Coding assistance was used during implementation for code generation, review, and test iteration.
Security decisions and observed behavior are represented by executable tests and documented here;
no generated output is treated as evidence without repository checks.

## Testing notes

- Unit tests use Vitest.
- End-to-end smoke tests use Playwright and expect production builds via `npm run build` before `npm run test:e2e`.
- Install Playwright browsers once before the first E2E run: `npx playwright install chromium`
- CI applies every migration, seeds deterministic synthetic data, runs unit and real PostgreSQL
  integration tests, builds all workspaces, installs Chromium, and executes the desktop/mobile
  Playwright journeys against production API and web builds.

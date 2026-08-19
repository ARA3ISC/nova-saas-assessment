# NOVA Technical Assessment Submission

## Delivered Scope

NOVA implements the requested vertical slice across Platform Administration and Organization Administration.

### Platform Administration
- One-time Platform Administrator bootstrap
- First-party email/password authentication
- Server-side sessions and logout
- Organization provisioning
- Initial-owner invitation flow
- Platform Organization directory
- Independent access and commercial lifecycle management
- Scoped Platform Administrator intervention

### Organization Administration
- Company creation, editing, deactivation, and reactivation
- Business Scope creation and editing
- Duplicate-aware Business Scope creation
- Parent/child lifecycle protection
- Collaborator invitation and activation
- Invitation resend and revoke
- Collaborator suspension, reactivation, and removal
- Capability-based access management
- Company and Business Scope assignments
- Permission preset versions resolving to explicit grants
- User promotion to Administrator
- Ownership transfer workflow

### Authentication & Recovery
- Argon2 password hashing
- Login throttling
- Server-side session management
- Invitation-based account activation
- Password reset request and completion
- Single-use invitation and recovery tokens

## Multi-Tenancy & Security

- PostgreSQL Row Level Security is enabled and forced for tenant-owned resources.
- Runtime application traffic uses the restricted `nova_app` PostgreSQL role.
- Tenant context is established server-side per transaction.
- Cross-Organization access is denied by database-level RLS.
- Session authority remains server-side.
- Sensitive lifecycle and governance operations require explicit confirmation and reason capture.
- Invitation and password-reset tokens are stored as hashes rather than raw tokens.
- Active access changes are enforced immediately through effective-access resolution and session/access invalidation where required.

## Transactional Email

Transactional email is implemented through Resend for:

1. Initial-owner invitations
2. Collaborator invitations
3. Password-reset emails

Secrets are supplied through environment variables and are not committed to the repository.

Local/demo email behavior depends on the configured Resend sender and account/domain restrictions.

## Validation

Final local validation:

- `npm run lint` — PASS
- `npm run typecheck` — PASS
- `npm run test` — PASS
  - 57 test files passed
  - 189 tests passed
- `npm run build` — PASS

The production build completes successfully. It currently reports non-blocking warnings related to Autoprefixer compatibility and the Next.js ESLint plugin configuration.

## Known Limitations

- Local/demo transactional email delivery depends on Resend sender verification and account restrictions.
- The current implementation focuses on the assessment-required vertical slice rather than optional infrastructure or product features outside the requested scope.

## Setup Caveats

- PostgreSQL must be running before migrations and database integration tests.
- The RLS migrations create/configure the restricted `nova_app` runtime database role.
- Integration tests require both the administrative and runtime database connection URLs.
- Real email delivery requires a valid `RESEND_API_KEY`, sender configuration, and application origin.
- Refer to `README.md` and `.env.example` for environment setup and startup instructions.

## Loom Demonstration

Loom URL:

`https://www.loom.com/share/9e051e1017604c7ea85bde47e0eafed5`
`https://www.loom.com/share/b1ab929ec990479d94969fb7b85be9bd`

The demonstration covers:

- Platform Administration
- Organization provisioning
- Companies and Business Scopes
- Collaborator administration
- Permission management
- Real collaborator invitation email delivery
- Invitation acceptance
- Invitation replay refusal
- Restricted collaborator access
- Real password-reset email delivery
- Successful password reset
- Multi-tenant/RLS and security overview

## Reviewer Access

The repository is private.

GitHub reviewer access is granted to:

`mbouzian42`

## Coding Assistant Usage

Coding assistants were used during implementation for code generation, debugging, review, UI iteration, and development acceleration.

The final architecture, security decisions, integration behavior, manual browser validation, and assessment compliance review were verified against the technical assessment requirements.

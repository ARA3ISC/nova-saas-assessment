'use client';

import { FormEvent, useState } from 'react';

import '../../../styles.css';

import {
  AuthShell,
  Feedback,
} from '../../../components/ui';

function csrf(): string | undefined {
  return document.cookie
    .split('; ')
    .find((part) =>
      part.startsWith('nova_csrf='),
    )
    ?.split('=')[1];
}

export default function AcceptCollaboratorPage() {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] =
    useState(false);
  const [acceptingExisting, setAcceptingExisting] =
    useState(false);

  const token =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(
          window.location.search,
        ).get('token');

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const password =
      new FormData(
        event.currentTarget,
      ).get('password');

    setSubmitting(true);
    setMessage('');

    try {
      const response = await fetch(
        '/api/invitations/collaborator/accept',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            token,
            password,
          }),
        },
      );

      const body =
        (await response.json()) as {
          accepted?: boolean;
        };

      setMessage(
        body.accepted
          ? 'Your NOVA account is active. You can now sign in.'
          : 'This invitation is invalid, expired, already used, or belongs to an existing account.',
      );
    } catch {
      setMessage(
        'We could not activate your account. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function acceptExisting() {
    const csrfToken = csrf();

    setAcceptingExisting(true);
    setMessage('');

    try {
      const response = await fetch(
        '/api/invitations/collaborator/accept-existing',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type':
              'application/json',
            ...(csrfToken
              ? {
                  'X-CSRF-Token':
                    csrfToken,
                }
              : {}),
          },
          body: JSON.stringify({
            token,
          }),
        },
      );

      const body =
        (await response.json()) as {
          accepted?: boolean;
        };

      setMessage(
        body.accepted
          ? 'Invitation accepted for your signed-in NOVA account.'
          : 'Sign in with the invited email address, then return to this invitation.',
      );
    } catch {
      setMessage(
        'We could not accept this invitation. Please try again.',
      );
    } finally {
      setAcceptingExisting(false);
    }
  }

  const successful =
    message.includes('active') ||
    message.includes('accepted');

  return (
    <AuthShell
      eyebrow="Collaborator invitation"
      title="Join your Organization"
      description="Choose the path that matches your NOVA account status."
      asideTitle="Access only what you need"
      asideText="Your profile, capabilities, Companies, and business scopes are resolved and enforced by NOVA."
    >
      <div className="invitationLanding">
        <section className="invitationPath invitationPathPrimary">
          <header>
            <span className="invitationPathNumber">
              01
            </span>

            <div>
              <h2>
                New to NOVA
              </h2>

              <p>
                Create your account and activate
                this collaborator invitation.
              </p>
            </div>
          </header>

          <form
            method="post"
            action="/api/invitations/collaborator/accept"
            onSubmit={submit}
          >
            <label>
              Create a password

              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={15}
                placeholder="At least 15 characters"
                disabled={submitting}
                required
              />

              <small className="helperText">
                A long passphrase is easier to
                remember and safer to use.
              </small>
            </label>

            <button
              disabled={
                submitting || !token
              }
            >
              {submitting
                ? 'Activating account…'
                : 'Create account and join'}
            </button>
          </form>
        </section>

        <div className="invitationDivider">
          <span>or</span>
        </div>

        <section className="invitationPath">
          <header>
            <span className="invitationPathNumber">
              02
            </span>

            <div>
              <h2>
                Already use NOVA
              </h2>

              <p>
                Sign in with the invited email
                address and attach this invitation
                to that identity.
              </p>
            </div>
          </header>

          <div className="invitationExistingActions">
            <button
              className="secondary"
              type="button"
              onClick={acceptExisting}
              disabled={
                acceptingExisting || !token
              }
            >
              {acceptingExisting
                ? 'Accepting…'
                : 'Accept as signed-in account'}
            </button>

            <a
              className="invitationLoginLink"
              href="/login"
              onClick={(event) => {
                event.preventDefault();

                window.location.assign(
                  `/login?returnTo=${encodeURIComponent(
                    window.location.pathname +
                      window.location.search,
                  )}`,
                );
              }}
            >
              Sign in with the invited email
            </a>
          </div>
        </section>

        {!token && (
          <Feedback tone="danger">
            This invitation link is incomplete.
            Open the complete link from your
            invitation email.
          </Feedback>
        )}

        {message && (
          <Feedback
            tone={
              successful
                ? 'success'
                : 'danger'
            }
          >
            {message}
          </Feedback>
        )}
      </div>
    </AuthShell>
  );
}

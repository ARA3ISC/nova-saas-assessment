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

export default function AcceptInitialOwnerPage() {
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

    const form =
      new FormData(event.currentTarget);

    setSubmitting(true);
    setMessage('');

    try {
      const response = await fetch(
        '/api/invitations/initial-owner/accept',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            token,
            password: form.get('password'),
          }),
        },
      );

      const body =
        (await response.json()) as {
          accepted?: boolean;
        };

      setMessage(
        body.accepted
          ? 'Your Organization is active and your owner account is ready.'
          : 'This invitation is invalid, expired, already used, or belongs to an existing account.',
      );
    } catch {
      setMessage(
        'We could not activate your Organization. Please try again.',
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
        '/api/invitations/initial-owner/accept-existing',
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
          ? 'Your Organization is active and ownership has been established.'
          : 'Sign in with the invited email address, then return to this invitation.',
      );
    } catch {
      setMessage(
        'We could not accept this owner invitation. Please try again.',
      );
    } finally {
      setAcceptingExisting(false);
    }
  }

  const successful =
    message.includes('active') ||
    message.includes('established');

  return (
    <AuthShell
      eyebrow="Initial owner invitation"
      title="Activate your Organization"
      description="Establish the first owner Administrator and bring this Organization online."
      asideTitle="Your Organization starts here"
      asideText="Acceptance activates the Organization and establishes its first owner Administrator as one atomic operation."
    >
      <div className="invitationLanding">
        <section className="invitationActivationSummary">
          <span className="sectionEyebrow">
            What happens next
          </span>

          <div>
            <span>1</span>
            <p>
              Your identity is created or securely
              linked.
            </p>
          </div>

          <div>
            <span>2</span>
            <p>
              You become the first Organization
              Administrator and owner.
            </p>
          </div>

          <div>
            <span>3</span>
            <p>
              The Organization becomes active.
            </p>
          </div>
        </section>

        <section className="invitationPath invitationPathPrimary">
          <header>
            <span className="invitationPathNumber">
              01
            </span>

            <div>
              <h2>
                Create your NOVA account
              </h2>

              <p>
                Use this if you have never signed
                in to NOVA before.
              </p>
            </div>
          </header>

          <form
            method="post"
            action="/api/invitations/initial-owner/accept"
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
                Use a long, unique passphrase for
                this owner account.
              </small>
            </label>

            <button
              disabled={
                submitting || !token
              }
            >
              {submitting
                ? 'Activating Organization…'
                : 'Activate Organization'}
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
                Already have a NOVA account
              </h2>

              <p>
                Sign in using the invited email
                address and attach ownership to
                that existing identity.
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
            This owner invitation link is
            incomplete. Open the complete link
            from your invitation email.
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

        {successful && (
          <a
            className="button invitationContinueButton"
            href="/login"
          >
            Continue to sign in
          </a>
        )}
      </div>
    </AuthShell>
  );
}

'use client';

import {
  FormEvent,
  useState,
} from 'react';

import '../styles.css';

import {
  AuthShell,
  Feedback,
} from '../components/ui';

export default function PasswordResetPage() {
  const [sent, setSent] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState('');

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const email =
      new FormData(
        event.currentTarget,
      ).get('email');

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(
        '/api/password-reset/request',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            email,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          'request failed',
        );
      }

      setSent(true);
    } catch {
      setError(
        'We could not request a reset link. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="Request a secure, single-use reset link without revealing whether an account exists."
      asideTitle="Private by default"
      asideText="NOVA uses neutral recovery responses and short-lived reset links to protect account information."
    >
      <div className="authJourney">
        {!sent ? (
          <>
            <section className="authRecoverySummary">
              <div>
                <b>01</b>
                <span>
                  Enter your account email
                </span>
              </div>

              <div>
                <b>02</b>
                <span>
                  Open the secure email link
                </span>
              </div>

              <div>
                <b>03</b>
                <span>
                  Choose a new password
                </span>
              </div>
            </section>

            <form
              className="authFocusedForm"
              method="post"
              action="/api/password-reset/request"
              onSubmit={submit}
            >
              <label>
                Account email

                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  disabled={submitting}
                  required
                />

                <small className="helperText">
                  The reset link is
                  single-use and expires
                  after 30 minutes.
                </small>
              </label>

              <button
                className="authPrimaryAction"
                disabled={submitting}
              >
                {submitting
                  ? 'Sending secure link…'
                  : 'Send reset link'}
              </button>

              {error && (
                <Feedback tone="danger">
                  {error}
                </Feedback>
              )}
            </form>
          </>
        ) : (
          <section className="authSuccessState">
            <span className="authSuccessIcon">
              ✓
            </span>

            <div>
              <span className="sectionEyebrow">
                Request received
              </span>

              <h2>Check your inbox</h2>

              <p>
                If an eligible account exists,
                a secure password-reset email
                has been sent.
              </p>
            </div>

            <a
              className="button"
              href="/login"
            >
              Return to sign in
            </a>
          </section>
        )}

        {!sent && (
          <a
            className="authBackLink"
            href="/login"
          >
            ← Return to sign in
          </a>
        )}
      </div>
    </AuthShell>
  );
}

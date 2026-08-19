'use client';

import {
  FormEvent,
  useState,
} from 'react';

import '../../styles.css';

import {
  AuthShell,
  Feedback,
} from '../../components/ui';

export default function CompleteResetPage() {
  const [message, setMessage] =
    useState('');

  const [success, setSuccess] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const form =
      new FormData(event.currentTarget);

    const token =
      new URLSearchParams(
        window.location.search,
      ).get('token');

    if (!token) {
      setMessage(
        'This reset link is invalid or incomplete.',
      );
      return;
    }

    const password = String(
      form.get('password') ?? '',
    );

    const confirmation = String(
      form.get(
        'passwordConfirmation',
      ) ?? '',
    );

    if (password !== confirmation) {
      setMessage(
        'The passwords do not match.',
      );
      return;
    }

    setSubmitting(true);
    setMessage('');

    try {
      const response = await fetch(
        '/api/password-reset/complete',
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

      const accepted =
        response.ok &&
        body.accepted === true;

      setSuccess(accepted);

      setMessage(
        accepted
          ? 'Password updated. You can now sign in.'
          : 'This reset link is invalid or expired.',
      );
    } catch {
      setMessage(
        'We could not update your password. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Secure recovery"
      title="Choose a new password"
      description="Completing recovery replaces your password and revokes existing sessions for this identity."
      asideTitle="Restore access securely"
      asideText="Password reset links are single-use, short-lived, and invalidated after successful recovery."
    >
      <div className="authJourney">
        {success ? (
          <section className="authSuccessState">
            <span className="authSuccessIcon">
              ✓
            </span>

            <div>
              <span className="sectionEyebrow">
                Recovery complete
              </span>

              <h2>Password updated</h2>

              <p>
                Your previous sessions have
                been invalidated. Sign in
                again using your new password.
              </p>
            </div>

            <a
              className="button"
              href="/login"
            >
              Continue to sign in
            </a>
          </section>
        ) : (
          <form
            className="authFocusedForm"
            method="post"
            action="/api/password-reset/complete"
            onSubmit={submit}
          >
            <section className="passwordGuidance">
              <strong>
                Create a strong password
              </strong>

              <span>
                Use at least 15 characters.
                A memorable passphrase is
                recommended.
              </span>
            </section>

            <label>
              New password

              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={15}
                placeholder="At least 15 characters"
                disabled={submitting}
                required
              />
            </label>

            <label>
              Confirm new password

              <input
                name="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                minLength={15}
                placeholder="Repeat the new password"
                disabled={submitting}
                required
              />
            </label>

            <button
              className="authPrimaryAction"
              disabled={submitting}
            >
              {submitting
                ? 'Updating password…'
                : 'Update password'}
            </button>

            {message && (
              <Feedback tone="danger">
                {message}
              </Feedback>
            )}
          </form>
        )}

        {!success && (
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

'use client';

import {
  FormEvent,
  useState,
} from 'react';

import {
  AuthShell,
  Feedback,
} from '../components/ui';
import { safeReturnTo } from '../login/safe-return-to';

import '../styles.css';

function csrfToken(): string | undefined {
  return document.cookie
    .split('; ')
    .find((item) =>
      item.startsWith('nova_csrf='),
    )
    ?.split('=')[1];
}

export default function RequiredPasswordChangePage() {
  const [message, setMessage] =
    useState('');

  const [submitting, setSubmitting] =
    useState(false);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const form =
      new FormData(event.currentTarget);

    const password = String(
      form.get('password') ?? '',
    );

    const confirmation = String(
      form.get('confirmation') ?? '',
    );

    if (password !== confirmation) {
      setMessage(
        'The passwords do not match.',
      );
      return;
    }

    setSubmitting(true);
    setMessage('');

    const csrf = csrfToken();

    const response = await fetch(
      '/api/auth/complete-required-password-change',
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type':
            'application/json',
          ...(csrf
            ? {
                'X-CSRF-Token': csrf,
              }
            : {}),
        },
        body: JSON.stringify({
          password,
        }),
      },
    );

    if (!response.ok) {
      const body =
        (await response
          .json()
          .catch(() => null)) as {
          message?: string;
        } | null;

      setMessage(
        body?.message ??
          'Choose a different password and try again.',
      );

      setSubmitting(false);
      return;
    }

    window.location.assign(
      safeReturnTo(
        new URLSearchParams(
          window.location.search,
        ).get('returnTo'),
        '/platform',
      ),
    );
  }

  return (
    <AuthShell
      eyebrow="Account security"
      title="Replace your bootstrap password"
      description="Create a private password before continuing to Platform administration."
      asideTitle="One-time security setup"
      asideText="The temporary bootstrap credential is replaced before Platform administration becomes available."
    >
      <div className="authJourney">
        <section className="authSecurityNotice">
          <span className="authSecurityIcon">
            🔐
          </span>

          <div>
            <strong>
              Your temporary password must
              be replaced
            </strong>

            <span>
              This step rotates your session
              and prevents continued use of
              the bootstrap credential.
            </span>
          </div>
        </section>

        <form
          className="authFocusedForm"
          method="post"
          action="/api/auth/complete-required-password-change"
          onSubmit={submit}
        >
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
              name="confirmation"
              type="password"
              autoComplete="new-password"
              minLength={15}
              placeholder="Repeat your password"
              disabled={submitting}
              required
            />
          </label>

          <section className="passwordGuidance">
            <strong>Password guidance</strong>

            <span>
              Use at least 15 characters and
              avoid commonly compromised or
              reused passwords.
            </span>
          </section>

          <button
            className="authPrimaryAction"
            disabled={submitting}
          >
            {submitting
              ? 'Securing account…'
              : 'Replace password and continue'}
          </button>

          {message && (
            <Feedback tone="danger">
              {message}
            </Feedback>
          )}
        </form>
      </div>
    </AuthShell>
  );
}

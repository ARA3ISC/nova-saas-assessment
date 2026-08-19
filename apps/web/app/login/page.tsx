'use client';

import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import '../styles.css';

import {
  AuthShell,
  Feedback,
} from '../components/ui';
import { safeReturnTo } from './safe-return-to';

export default function LoginPage() {
  const [hydrated, setHydrated] =
    useState(false);

  const [message, setMessage] =
    useState(() =>
      typeof window !== 'undefined' &&
      new URLSearchParams(
        window.location.search,
      ).get('reason') ===
        'ownership-transferred'
        ? 'Ownership transferred successfully. Sign in again to continue with your new access.'
        : '',
    );

  const [submitting, setSubmitting] =
    useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const form =
      new FormData(event.currentTarget);

    setSubmitting(true);
    setMessage('');

    const response = await fetch(
      '/api/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: form.get('email'),
          password:
            form.get('password'),
        }),
      },
    );

    if (!response.ok) {
      setMessage(
        'We could not sign you in. Check your email and password.',
      );
      setSubmitting(false);
      return;
    }

    const result =
      (await response.json()) as {
        mustChangePassword?: boolean;
      };

    const returnTo = safeReturnTo(
      new URLSearchParams(
        window.location.search,
      ).get('returnTo'),
    );

    window.location.assign(
      result.mustChangePassword
        ? `/password-change-required?returnTo=${encodeURIComponent(
            returnTo,
          )}`
        : returnTo,
    );
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to NOVA"
      description="Continue to the workspace and permissions assigned to your account."
      asideTitle="One secure identity, one authorized workspace"
      asideText="NOVA verifies your identity, Organization, membership, and permissions before protected actions are allowed."
    >
      <div className="authJourney">
        <section className="authJourneyIntro">
          <span className="sectionEyebrow">
            Secure sign in
          </span>

          <div className="authJourneyBenefits">
            <span>
              <b>01</b>
              Server-side session
            </span>

            <span>
              <b>02</b>
              Organization isolation
            </span>

            <span>
              <b>03</b>
              Permission-aware access
            </span>
          </div>
        </section>

        <form
          className="authFocusedForm"
          method="post"
          action="/api/auth/login"
          onSubmit={submit}
        >
          <label>
            Email address

            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              disabled={
                !hydrated || submitting
              }
              required
            />
          </label>

          <label>
            Password

            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              disabled={
                !hydrated || submitting
              }
              required
            />
          </label>

          <div className="authFormUtility">
            <span>
              Use the email address associated
              with your NOVA identity.
            </span>

            <a href="/password-reset">
              Forgot password?
            </a>
          </div>

          <button
            className="authPrimaryAction"
            disabled={
              !hydrated || submitting
            }
          >
            {!hydrated
              ? 'Loading secure sign in…'
              : submitting
                ? 'Signing in…'
                : 'Sign in'}
          </button>

          {message && (
            <Feedback
              tone={
                message.includes(
                  'successfully',
                )
                  ? 'success'
                  : 'danger'
              }
            >
              {message}
            </Feedback>
          )}
        </form>
      </div>
    </AuthShell>
  );
}

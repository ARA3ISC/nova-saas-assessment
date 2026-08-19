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

export default function PlatformBootstrapPage() {
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

    setSubmitting(true);
    setMessage('');
    setSuccess(false);

    try {
      const response = await fetch(
        '/api/platform/bootstrap',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            email: form.get('email'),
            password:
              form.get('password'),
            bootstrapToken:
              form.get('bootstrapToken'),
          }),
        },
      );

      if (response.ok) {
        setSuccess(true);
        setMessage(
          'Platform Administrator created. You can now sign in.',
        );
        return;
      }

      const problem =
        (await response
          .json()
          .catch(() => null)) as {
          detail?: string;
          message?: string;
        } | null;

      setMessage(
        problem?.detail ??
          problem?.message ??
          'Bootstrap is unavailable or has already been completed.',
      );
    } catch {
      setMessage(
        'Platform bootstrap could not be completed.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="One-time setup"
      title="Initialize NOVA"
      description="Create the first Platform Administrator using the bootstrap secret provisioned on the server."
      asideTitle="Platform root of trust"
      asideText="Bootstrap is intentionally available only once. After successful initialization, ordinary authentication takes over."
    >
      <div className="bootstrapV2">
        <section className="bootstrapV2Notice">
          <span>01</span>

          <div>
            <strong>
              One-time initialization
            </strong>

            <p>
              This endpoint becomes unavailable
              after the first Platform Administrator
              is created.
            </p>
          </div>
        </section>

        <form
          className="bootstrapV2Form"
          onSubmit={submit}
        >
          <label>
            Administrator email

            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="platform-admin@example.com"
              disabled={submitting}
              required
            />
          </label>

          <label>
            Administrator password

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
              Use a unique password with at least
              15 characters.
            </small>
          </label>

          <label>
            Bootstrap secret

            <input
              name="bootstrapToken"
              type="password"
              autoComplete="off"
              placeholder="Server-provisioned bootstrap token"
              disabled={submitting}
              required
            />

            <small className="helperText">
              This secret should come from the
              server environment, not from the
              browser or repository.
            </small>
          </label>

          <section className="bootstrapV2Sequence">
            <div>
              <span>1</span>
              Validate bootstrap secret
            </div>

            <div>
              <span>2</span>
              Create Platform Administrator
            </div>

            <div>
              <span>3</span>
              Disable further bootstrap
            </div>
          </section>

          <button
            className="bootstrapV2Submit"
            disabled={submitting}
          >
            {submitting
              ? 'Initializing NOVA…'
              : 'Create Platform Administrator'}
          </button>
        </form>

        {message && (
          <Feedback
            tone={
              success
                ? 'success'
                : 'danger'
            }
          >
            {message}
          </Feedback>
        )}

        {success ? (
          <a
            className="button bootstrapV2Login"
            href="/login"
          >
            Continue to sign in
          </a>
        ) : (
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

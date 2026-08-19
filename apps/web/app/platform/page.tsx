'use client';

import {
  FormEvent,
  useState,
} from 'react';

import '../styles.css';

import {
  AppShell,
  Feedback,
  PageHeader,
  platformNav,
} from '../components/ui';

function csrf(): string | undefined {
  return document.cookie
    .split('; ')
    .find((part) =>
      part.startsWith('nova_csrf='),
    )
    ?.split('=')[1];
}

export default function PlatformPage() {
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

    const formElement =
      event.currentTarget;

    const form =
      new FormData(formElement);

    const token = csrf();

    setSubmitting(true);
    setMessage('');
    setSuccess(false);

    try {
      const response = await fetch(
        '/api/platform/organizations',
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type':
              'application/json',
            ...(token
              ? {
                  'X-CSRF-Token':
                    token,
                }
              : {}),
          },
          body: JSON.stringify({
            name: form.get('name'),
            ownerEmail:
              form.get('ownerEmail'),
          }),
        },
      );

      if (response.ok) {
        setSuccess(true);

        setMessage(
          'Organization provisioned. The initial-owner invitation is queued for email delivery.',
        );

        formElement.reset();
        return;
      }

      const problem =
        (await response
          .json()
          .catch(() => null)) as {
          detail?: string;
          message?: string;
          correlationId?: string;
        } | null;

      setMessage(
        `${
          problem?.detail ??
          problem?.message ??
          'Organization provisioning failed.'
        }${
          problem?.correlationId
            ? ` Reference: ${problem.correlationId}`
            : ''
        }`,
      );
    } catch {
      setMessage(
        'Organization provisioning could not be completed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell
      area="Platform control plane"
      active="/platform"
      items={platformNav}
      footer="Minimized support metadata only"
      requiredAccess="platform-administrator"
    >
      <PageHeader
        eyebrow="Platform administration"
        title="Control plane"
        description="Provision customer Organizations and manage platform-safe lifecycle operations without opening tenant business data."
      />

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

      <section className="platformHomeGrid">
        <section className="platformProvisionPanel">
          <header className="platformProvisionHeader">
            <div>
              <span className="sectionEyebrow">
                New customer
              </span>

              <h2>
                Provision an Organization
              </h2>

              <p>
                Create the customer account in
                Provisioning state and send one
                secure invitation to its initial
                owner.
              </p>
            </div>

            <span className="platformProvisionBadge">
              PROVISIONING
            </span>
          </header>

          <form
            className="platformProvisionForm"
            onSubmit={submit}
          >
            <label>
              Organization name

              <input
                name="name"
                placeholder="Example Holdings"
                disabled={submitting}
                required
              />

              <small className="helperText">
                This becomes the customer
                Organization displayed throughout
                NOVA.
              </small>
            </label>

            <label>
              Initial owner email

              <input
                name="ownerEmail"
                type="email"
                autoComplete="email"
                placeholder="owner@example.com"
                disabled={submitting}
                required
              />

              <small className="helperText">
                The owner receives a single-use,
                seven-day activation invitation.
              </small>
            </label>

            <div className="platformProvisionOutcome">
              <div>
                <span>1</span>
                <p>
                  Organization created as
                  <strong> Provisioning</strong>
                </p>
              </div>

              <div>
                <span>2</span>
                <p>
                  Initial-owner invitation queued
                  for email delivery
                </p>
              </div>

              <div>
                <span>3</span>
                <p>
                  Organization activates only after
                  successful owner acceptance
                </p>
              </div>
            </div>

            <button
              className="platformProvisionAction"
              disabled={submitting}
            >
              {submitting
                ? 'Provisioning…'
                : 'Provision Organization'}
            </button>
          </form>
        </section>

        <aside className="platformControlPanel">
          <header>
            <span className="sectionEyebrow">
              Control plane
            </span>

            <h2>
              Platform operations
            </h2>

            <p>
              Platform administration remains
              intentionally narrow and separate from
              customer business data.
            </p>
          </header>

          <nav className="platformOperationList">
            <a href="/platform/directory">
              <span className="platformOperationIcon">
                01
              </span>

              <div>
                <strong>
                  Organization directory
                </strong>

                <small>
                  Search minimized customer and
                  ownership metadata.
                </small>
              </div>

              <b>→</b>
            </a>

            <a href="/platform/lifecycle">
              <span className="platformOperationIcon">
                02
              </span>

              <div>
                <strong>
                  Lifecycle controls
                </strong>

                <small>
                  Manage customer access and
                  commercial status independently.
                </small>
              </div>

              <b>→</b>
            </a>

            <a href="/platform/interventions">
              <span className="platformOperationIcon">
                03
              </span>

              <div>
                <strong>
                  Scoped intervention
                </strong>

                <small>
                  Suspend one eligible collaborator
                  without entering tenant data.
                </small>
              </div>

              <b>→</b>
            </a>
          </nav>

          <section className="platformBoundarySummary">
            <strong>
              Platform boundary
            </strong>

            <div>
              <span>✓</span>
              No general tenant-data browsing
            </div>

            <div>
              <span>✓</span>
              Sensitive actions are evidenced
            </div>

            <div>
              <span>✓</span>
              Tenant isolation remains authoritative
            </div>
          </section>
        </aside>
      </section>
    </AppShell>
  );
}

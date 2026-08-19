'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

import '../../styles.css';

import {
  AppShell,
  CheckboxRow,
  Dialog,
  DialogActions,
  EmptyState,
  Feedback,
  PageHeader,
  StatusBadge,
  platformNav,
} from '../../components/ui';

type Organization = {
  id: string;
  version: number;
  name: string;
  accessStatus: string;
  commercialStatus: string;
  ownership: {
    membership: {
      identity: {
        email: string;
      };
    };
  } | null;
};

export default function PlatformDirectoryPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] =
    useState<'success' | 'danger'>('danger');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Organization | null>(null);
  const [query, setQuery] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [resendOpen, setResendOpen] = useState(false);

  async function load(q = '', cursor?: string) {
    setLoading(true);

    const parameters = new URLSearchParams({
      q,
      take: '25',
    });

    if (cursor) {
      parameters.set('cursor', cursor);
    }

    const response = await fetch(
      `/api/platform/organizations?${parameters}`,
      {
        credentials: 'include',
      },
    );

    if (!response.ok) {
      setMessage(
        'Directory unavailable. Platform access is required.',
      );
      setMessageTone('danger');
      setLoading(false);
      return;
    }

    const page = (await response.json()) as {
      items: Organization[];
      nextCursor: string | null;
    };

    const rows = cursor
      ? [...organizations, ...page.items]
      : page.items;

    setOrganizations(rows);
    setNextCursor(page.nextCursor);

    setSelected(
      (current) =>
        rows.find((row) => row.id === current?.id) ??
        rows[0] ??
        null,
    );

    setMessage('');
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const q = new FormData(event.currentTarget).get('q');
    const nextQuery = String(q ?? '').trim();

    setQuery(nextQuery);
    await load(nextQuery);
  }

  async function resendInitialOwner(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!selected) {
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const token = document.cookie
      .split('; ')
      .find((part) => part.startsWith('nova_csrf='))
      ?.split('=')[1];

    const response = await fetch(
      `/api/platform/organizations/${selected.id}/initial-owner-invitation/resend`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-CSRF-Token': token } : {}),
        },
        body: JSON.stringify({
          expectedVersion: selected.version,
          reason: form.get('reason'),
          confirmed: form.get('confirmed') === 'on',
        }),
      },
    );

    if (response.ok) {
      await load(query);
      formElement.reset();

      setMessage(
        'The previous owner link was revoked and a replacement was queued for delivery.',
      );
      setMessageTone('success');
      setResendOpen(false);
      return;
    }

    const problem = (await response.json().catch(() => null)) as {
      detail?: string;
      message?: string;
      correlationId?: string;
    } | null;

    setMessage(
      `${
        problem?.detail ??
        problem?.message ??
        'Owner invitation resend failed.'
      }${
        problem?.correlationId
          ? ` Reference: ${problem.correlationId}`
          : ''
      }`,
    );

    setMessageTone('danger');
  }

  const counts = useMemo(() => {
    return {
      total: organizations.length,
      active: organizations.filter(
        (organization) =>
          organization.accessStatus === 'ACTIVE',
      ).length,
      provisioning: organizations.filter(
        (organization) =>
          organization.accessStatus === 'PROVISIONING',
      ).length,
      suspended: organizations.filter(
        (organization) =>
          organization.accessStatus === 'SUSPENDED',
      ).length,
    };
  }, [organizations]);

  return (
    <AppShell
      area="Platform control plane"
      active="/platform/directory"
      items={platformNav}
      footer="Support-safe Organization metadata"
      requiredAccess="platform-administrator"
    >
      <PageHeader
        eyebrow="Customer accounts"
        title="Organizations"
        description="Search customer Organizations and inspect lifecycle, ownership, and commercial metadata without opening tenant business data."
        actions={
          <a className="button" href="/platform">
            + Create Organization
          </a>
        }
      />

      <section className="platformDirectoryStats">
        <article>
          <span>Total</span>
          <strong>{counts.total}</strong>
        </article>

        <article>
          <span>Active</span>
          <strong>{counts.active}</strong>
        </article>

        <article>
          <span>Provisioning</span>
          <strong>{counts.provisioning}</strong>
        </article>

        <article>
          <span>Suspended</span>
          <strong>{counts.suspended}</strong>
        </article>
      </section>

      {message && (
        <Feedback tone={messageTone}>
          {message}
        </Feedback>
      )}

      <section className="platformDirectoryWorkspace">
        <div className="platformDirectoryPanel">
          <header className="platformDirectoryPanelHeader">
            <div>
              <span className="sectionEyebrow">
                Directory
              </span>
              <h2>Customer Organizations</h2>
            </div>

            <span>
              {organizations.length} loaded
            </span>
          </header>

          <form
            className="platformDirectorySearch"
            onSubmit={search}
          >
            <label>
              <span className="srOnly">
                Search Organizations
              </span>

              <input
                name="q"
                defaultValue={query}
                placeholder="Search by Organization name…"
              />
            </label>

            <button disabled={loading}>
              {loading ? 'Loading…' : 'Search'}
            </button>
          </form>

          {!loading && organizations.length === 0 ? (
            <EmptyState
              title="No Organizations found"
              description="Try a broader search or provision a new customer Organization."
              action={
                <a className="button" href="/platform">
                  Provision Organization
                </a>
              }
            />
          ) : (
            <div className="platformOrganizationList">
              {organizations.map((organization) => (
                <button
                  key={organization.id}
                  type="button"
                  className={
                    selected?.id === organization.id
                      ? 'platformOrganizationRow platformOrganizationRowSelected'
                      : 'platformOrganizationRow'
                  }
                  onClick={() =>
                    setSelected(organization)
                  }
                >
                  <span className="platformOrganizationIdentity">
                    <strong>
                      {organization.name}
                    </strong>

                    <small>
                      {organization.ownership
                        ?.membership.identity.email ??
                        'No active owner'}
                    </small>
                  </span>

                  <span className="platformOrganizationStatus">
                    <StatusBadge
                      status={organization.accessStatus}
                    />
                  </span>
                </button>
              ))}

              {nextCursor && (
                <button
                  type="button"
                  className="secondaryAction platformLoadMore"
                  disabled={loading}
                  onClick={() =>
                    void load(query, nextCursor)
                  }
                >
                  {loading
                    ? 'Loading…'
                    : 'Load more Organizations'}
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="platformOrganizationDetails">
          {selected ? (
            <>
              <header className="platformOrganizationDetailsHeader">
                <div>
                  <span className="sectionEyebrow">
                    Selected Organization
                  </span>

                  <h2>{selected.name}</h2>
                </div>

                <StatusBadge
                  status={selected.accessStatus}
                />
              </header>

              <dl className="platformOrganizationMeta">
                <div>
                  <dt>Commercial status</dt>
                  <dd>
                    <StatusBadge
                      status={
                        selected.commercialStatus
                      }
                    />
                  </dd>
                </div>

                <div>
                  <dt>Owner</dt>
                  <dd>
                    {selected.ownership?.membership
                      .identity.email ??
                      'No active owner'}
                  </dd>
                </div>

                <div>
                  <dt>Organization ID</dt>
                  <dd>
                    <code>{selected.id}</code>
                  </dd>
                </div>
              </dl>

              <div className="platformOrganizationActions">
                <a
                  className="button"
                  href={`/platform/lifecycle?organizationId=${selected.id}`}
                >
                  Manage lifecycle
                </a>

                <a
                  className="button buttonSecondary"
                  href={`/platform/interventions?organizationId=${selected.id}`}
                >
                  Scoped intervention
                </a>

                {selected.accessStatus ===
                  'PROVISIONING' && (
                  <button
                    className="secondaryAction"
                    type="button"
                    onClick={() =>
                      setResendOpen(true)
                    }
                  >
                    Replace owner invitation
                  </button>
                )}
              </div>
            </>
          ) : (
            <EmptyState
              title="Select an Organization"
              description="Choose an Organization from the directory to inspect its platform-safe metadata."
            />
          )}
        </aside>
      </section>

      <Dialog
        open={
          resendOpen &&
          selected?.accessStatus ===
            'PROVISIONING'
        }
        onClose={() => setResendOpen(false)}
        title="Replace owner invitation"
        description={`Revoke the previous link for ${
          selected?.name ?? 'this organization'
        } and send one secure replacement.`}
      >
        <form onSubmit={resendInitialOwner}>
          <label>
            Reason
            <input
              name="reason"
              required
              placeholder="Why is a replacement needed?"
            />
          </label>

          <CheckboxRow
            name="confirmed"
            title="Revoke the previous invitation"
            description="Send one new seven-day owner invitation to the recorded email address."
            required
          />

          <DialogActions>
            <button
              className="secondaryAction"
              type="button"
              onClick={() =>
                setResendOpen(false)
              }
            >
              Cancel
            </button>

            <button>
              Send replacement invitation
            </button>
          </DialogActions>
        </form>
      </Dialog>
    </AppShell>
  );
}

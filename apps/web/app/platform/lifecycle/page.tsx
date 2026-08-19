'use client';

import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import '../../styles.css';

import {
  AppShell,
  CheckboxRow,
  EmptyState,
  Feedback,
  PageHeader,
  StatusBadge,
  platformNav,
} from '../../components/ui';

type Organization = {
  id: string;
  name: string;
  accessStatus: string;
  commercialStatus: string;
  version: number;
};

function csrf(): string | undefined {
  return document.cookie
    .split('; ')
    .find((part) =>
      part.startsWith('nova_csrf='),
    )
    ?.split('=')[1];
}

export default function PlatformLifecyclePage() {
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState('access');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] =
    useState(false);
  const [loading, setLoading] =
    useState(true);
  const [organizations, setOrganizations] =
    useState<Organization[]>([]);

  const [organizationId, setOrganizationId] =
    useState(
      typeof window === 'undefined'
        ? ''
        : (new URLSearchParams(
            window.location.search,
          ).get('organizationId') ?? ''),
    );

  const selected = organizations.find(
    (organization) =>
      organization.id === organizationId,
  );

  const accessOptions: Record<
    string,
    { value: string; label: string }[]
  > = {
    PROVISIONING: [
      {
        value: 'DISABLED',
        label: 'Disabled — terminal',
      },
    ],
    ACTIVE: [
      {
        value: 'SUSPENDED',
        label: 'Suspended',
      },
      {
        value: 'DISABLED',
        label: 'Disabled — terminal',
      },
    ],
    SUSPENDED: [
      {
        value: 'ACTIVE',
        label: 'Active',
      },
      {
        value: 'DISABLED',
        label: 'Disabled — terminal',
      },
    ],
    DISABLED: [],
  };

  const availableAccessOptions = selected
    ? (accessOptions[
        selected.accessStatus
      ] ?? [])
    : [];

  const availableCommercialOptions = [
    'DEMO',
    'PILOT',
    'ACTIVE',
  ].filter(
    (value) =>
      value !== selected?.commercialStatus,
  );

  useEffect(() => {
    void fetch(
      '/api/platform/organizations?take=100',
      {
        credentials: 'include',
      },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            'Directory unavailable',
          );
        }

        const rows = (
          (await response.json()) as {
            items: Organization[];
          }
        ).items;

        setOrganizations(rows);

        setOrganizationId((current) =>
          rows.some(
            (organization) =>
              organization.id === current,
          )
            ? current
            : '',
        );
      })
      .catch(() =>
        setMessage(
          'Organization directory unavailable. Platform access is required.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  function changeKind(nextKind: string) {
    setKind(nextKind);

    setStatus(
      nextKind === 'access'
        ? (availableAccessOptions[0]
            ?.value ?? '')
        : (availableCommercialOptions[0] ??
            ''),
    );

    setMessage('');
  }

  useEffect(() => {
    setStatus(
      kind === 'access'
        ? (availableAccessOptions[0]
            ?.value ?? '')
        : (availableCommercialOptions[0] ??
            ''),
    );
  }, [
    kind,
    organizationId,
    selected?.accessStatus,
    selected?.commercialStatus,
  ]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const form = new FormData(
      event.currentTarget,
    );

    const token = csrf();

    const path =
      kind === 'access'
        ? 'access-status'
        : 'commercial-status';

    setSubmitting(true);
    setMessage('');

    const response = await fetch(
      `/api/platform/organizations/${organizationId}/${path}`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type':
            'application/json',
          ...(token
            ? {
                'X-CSRF-Token': token,
              }
            : {}),
        },
        body: JSON.stringify({
          status,
          reason: form.get('reason'),
          confirmed:
            form.get('confirmed') === 'on',
          expectedVersion:
            selected?.version,
        }),
      },
    );

    if (response.ok) {
      const updated =
        (await response.json()) as {
          accessStatus?: string;
          commercialStatus?: string;
          version: number;
        };

      setOrganizations((current) =>
        current.map((organization) =>
          organization.id ===
          organizationId
            ? {
                ...organization,
                ...updated,
              }
            : organization,
        ),
      );

      setMessage(
        'Organization status updated and lifecycle evidence recorded.',
      );
    } else {
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
          'Status update failed.'
        }${
          problem?.correlationId
            ? ` Reference: ${problem.correlationId}`
            : ''
        }`,
      );
    }

    setSubmitting(false);
  }

  return (
    <AppShell
      area="Platform control plane"
      active="/platform/lifecycle"
      items={platformNav}
      footer="Sensitive transitions are evidenced"
      requiredAccess="platform-administrator"
    >
      <PageHeader
        eyebrow="Customer lifecycle"
        title="Organization lifecycle"
        description="Manage customer access and commercial state as separate lifecycle dimensions."
        actions={
          <a
            className="button buttonSecondary"
            href="/platform/directory"
          >
            Back to Organizations
          </a>
        }
      />

      {message && (
        <Feedback
          tone={
            message.includes('updated')
              ? 'success'
              : 'danger'
          }
        >
          {message}
        </Feedback>
      )}

      {!loading &&
      organizations.length === 0 ? (
        <EmptyState
          title="No Organizations available"
          description="Provision an Organization before applying lifecycle changes."
        />
      ) : (
        <section className="platformLifecycleWorkspace">
          <aside className="platformLifecycleContext">
            <header>
              <span className="sectionEyebrow">
                Customer account
              </span>

              <h2>
                {selected?.name ??
                  'Select an Organization'}
              </h2>
            </header>

            <label>
              Organization

              <select
                name="organizationId"
                value={organizationId}
                onChange={(event) => {
                  setOrganizationId(
                    event.target.value,
                  );
                  setMessage('');
                }}
                disabled={loading}
                required
              >
                <option value="">
                  {loading
                    ? 'Loading Organizations…'
                    : 'Select an Organization'}
                </option>

                {organizations.map(
                  (organization) => (
                    <option
                      key={organization.id}
                      value={organization.id}
                    >
                      {organization.name}
                    </option>
                  ),
                )}
              </select>
            </label>

            {selected && (
              <div className="platformLifecycleStatusGrid">
                <article>
                  <span>Access</span>
                  <StatusBadge
                    status={
                      selected.accessStatus
                    }
                  />
                </article>

                <article>
                  <span>Commercial</span>
                  <StatusBadge
                    status={
                      selected.commercialStatus
                    }
                  />
                </article>
              </div>
            )}

            <div className="platformLifecycleGuidance">
              <article>
                <strong>Suspended</strong>
                <span>
                  Immediately blocks tenant
                  access but can be reactivated.
                </span>
              </article>

              <article>
                <strong>Disabled</strong>
                <span>
                  Terminal Organization access
                  closure with no ordinary
                  reactivation path.
                </span>
              </article>

              <article>
                <strong>Commercial</strong>
                <span>
                  Tracks Demo, Pilot, or Active
                  independently from customer
                  access.
                </span>
              </article>
            </div>
          </aside>

          <form
            className="platformLifecycleForm"
            onSubmit={submit}
          >
            <header className="platformLifecycleFormHeader">
              <span className="sectionEyebrow">
                Lifecycle change
              </span>

              <h2>
                Choose the change to apply
              </h2>

              <p>
                The server validates allowed
                transitions and records the
                reason with your identity.
              </p>
            </header>

            <fieldset
              className="platformLifecycleDimension"
              disabled={!selected}
            >
              <legend>Status dimension</legend>

              <label
                className={
                  kind === 'access'
                    ? 'platformLifecycleChoice platformLifecycleChoiceSelected'
                    : 'platformLifecycleChoice'
                }
              >
                <input
                  type="radio"
                  name="kind"
                  value="access"
                  checked={
                    kind === 'access'
                  }
                  onChange={() =>
                    changeKind('access')
                  }
                />

                <span>
                  <strong>
                    Access status
                  </strong>

                  <small>
                    Controls whether customer
                    users can access NOVA.
                  </small>
                </span>
              </label>

              <label
                className={
                  kind === 'commercial'
                    ? 'platformLifecycleChoice platformLifecycleChoiceSelected'
                    : 'platformLifecycleChoice'
                }
              >
                <input
                  type="radio"
                  name="kind"
                  value="commercial"
                  checked={
                    kind === 'commercial'
                  }
                  onChange={() =>
                    changeKind('commercial')
                  }
                />

                <span>
                  <strong>
                    Commercial status
                  </strong>

                  <small>
                    Tracks customer lifecycle
                    independently from access.
                  </small>
                </span>
              </label>
            </fieldset>

            <label>
              New status

              <select
                name="status"
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value,
                  )
                }
                required
                disabled={!selected}
              >
                {kind === 'access' ? (
                  availableAccessOptions.length ? (
                    availableAccessOptions.map(
                      (option) => (
                        <option
                          key={option.value}
                          value={
                            option.value
                          }
                        >
                          {option.label}
                        </option>
                      ),
                    )
                  ) : (
                    <option value="">
                      No further access
                      transition available
                    </option>
                  )
                ) : (
                  availableCommercialOptions.map(
                    (value) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {value[0] +
                          value
                            .slice(1)
                            .toLowerCase()}
                      </option>
                    ),
                  )
                )}
              </select>
            </label>

            <label>
              Reason

              <textarea
                name="reason"
                placeholder="Explain why this lifecycle change is necessary"
                required
                disabled={!selected}
              />
            </label>

            <CheckboxRow
              name="confirmed"
              title="I confirm this sensitive lifecycle change"
              description="The action will be attributed to your identity and recorded with its reason."
              required
            />

            {kind === 'access' &&
              status === 'DISABLED' && (
                <div className="platformTerminalWarning">
                  <strong>
                    This is a terminal action.
                  </strong>

                  <span>
                    Disabled Organizations do
                    not have an ordinary
                    reactivation path.
                  </span>
                </div>
              )}

            <div className="platformLifecycleActions">
              <a
                className="button buttonSecondary"
                href="/platform/directory"
              >
                Cancel
              </a>

              <button
                className={
                  kind === 'access' &&
                  status === 'DISABLED'
                    ? 'dangerButton'
                    : undefined
                }
                disabled={
                  submitting ||
                  !selected ||
                  (kind === 'access' &&
                    availableAccessOptions.length ===
                      0)
                }
              >
                {submitting
                  ? 'Applying…'
                  : 'Apply status change'}
              </button>
            </div>
          </form>
        </section>
      )}
    </AppShell>
  );
}

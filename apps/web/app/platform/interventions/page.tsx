'use client';

import {
  FormEvent,
  useEffect,
  useMemo,
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

function csrf(): string | undefined {
  return document.cookie
    .split('; ')
    .find((part) =>
      part.startsWith('nova_csrf='),
    )
    ?.split('=')[1];
}

type Organization = {
  id: string;
  name: string;
  accessStatus: string;
};

type Candidate = {
  id: string;
  profile: string;
  status: string;
  identity: {
    email: string;
  };
};

export default function InterventionsPage() {
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] =
    useState<'success' | 'danger'>('danger');

  const [submitting, setSubmitting] =
    useState(false);

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

  const [membershipId, setMembershipId] =
    useState('');

  const [candidates, setCandidates] =
    useState<Candidate[]>([]);

  const [loadingOrganizations, setLoadingOrganizations] =
    useState(true);

  const [loadingCandidates, setLoadingCandidates] =
    useState(false);

  const selectedOrganization =
    useMemo(
      () =>
        organizations.find(
          (organization) =>
            organization.id === organizationId,
        ) ?? null,
      [organizations, organizationId],
    );

  const selectedCandidate =
    useMemo(
      () =>
        candidates.find(
          (candidate) =>
            candidate.id === membershipId,
        ) ?? null,
      [candidates, membershipId],
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

        const page =
          (await response.json()) as {
            items: Organization[];
          };

        setOrganizations(page.items);
      })
      .catch(() => {
        setMessage(
          'Organization directory unavailable. Platform access is required.',
        );
        setMessageTone('danger');
      })
      .finally(() =>
        setLoadingOrganizations(false),
      );
  }, []);

  useEffect(() => {
    setMembershipId('');

    if (!organizationId) {
      setCandidates([]);
      return;
    }

    setLoadingCandidates(true);

    void fetch(
      `/api/platform/organizations/${organizationId}/intervention-candidates`,
      {
        credentials: 'include',
      },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            'Candidate lookup failed',
          );
        }

        setCandidates(
          (await response.json()) as Candidate[],
        );
      })
      .catch(() => {
        setCandidates([]);
        setMessage(
          'Eligible collaborators could not be loaded for this Organization.',
        );
        setMessageTone('danger');
      })
      .finally(() =>
        setLoadingCandidates(false),
      );
  }, [organizationId]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!organizationId || !membershipId) {
      return;
    }

    const form = new FormData(
      event.currentTarget,
    );

    const token = csrf();

    setSubmitting(true);
    setMessage('');

    const response = await fetch(
      `/api/platform/organizations/${organizationId}/interventions/suspend-collaborator`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token
            ? {
                'X-CSRF-Token': token,
              }
            : {}),
        },
        body: JSON.stringify({
          membershipId,
          reason: form.get('reason'),
          confirmed:
            form.get('confirmed') === 'on',
        }),
      },
    );

    if (response.ok) {
      setCandidates((current) =>
        current.filter(
          (candidate) =>
            candidate.id !== membershipId,
        ),
      );

      setMembershipId('');

      setMessage(
        'Collaborator suspended and active sessions revoked.',
      );

      setMessageTone('success');
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
          'Intervention failed.'
        }${
          problem?.correlationId
            ? ` Reference: ${problem.correlationId}`
            : ''
        }`,
      );

      setMessageTone('danger');
    }

    setSubmitting(false);
  }

  return (
    <AppShell
      area="Platform control plane"
      active="/platform/interventions"
      items={platformNav}
      footer="No customer business-data access"
      requiredAccess="platform-administrator"
    >
      <PageHeader
        eyebrow="Support operation"
        title="Scoped user intervention"
        description="Suspend one collaborator inside one Organization without opening or bypassing customer business data."
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
        <Feedback tone={messageTone}>
          {message}
        </Feedback>
      )}

      <section className="interventionWorkspaceRedesigned">
        <aside className="interventionBoundaryPanel">
          <header>
            <span className="sectionEyebrow">
              Safety boundary
            </span>

            <h2>Narrow by design</h2>

            <p>
              This support action is intentionally
              limited to one Organization and one
              eligible collaborator.
            </p>
          </header>

          <div className="interventionBoundaryList">
            <article>
              <span>01</span>

              <div>
                <strong>
                  One Organization
                </strong>

                <p>
                  The Organization is selected
                  explicitly before any collaborator
                  lookup occurs.
                </p>
              </div>
            </article>

            <article>
              <span>02</span>

              <div>
                <strong>
                  One membership
                </strong>

                <p>
                  Only eligible active non-owner
                  collaborators are exposed.
                </p>
              </div>
            </article>

            <article>
              <span>03</span>

              <div>
                <strong>
                  Immediate revocation
                </strong>

                <p>
                  Successful suspension invalidates
                  active access immediately.
                </p>
              </div>
            </article>
          </div>

          {selectedOrganization && (
            <div className="interventionCurrentBoundary">
              <span>Current Organization</span>

              <strong>
                {selectedOrganization.name}
              </strong>

              <StatusBadge
                status={
                  selectedOrganization.accessStatus
                }
              />
            </div>
          )}
        </aside>

        <form
          className="interventionActionPanel"
          onSubmit={submit}
        >
          <header className="interventionActionHeader">
            <span className="sectionEyebrow">
              Intervention
            </span>

            <h2>Suspend a collaborator</h2>

            <p>
              Select the exact customer account and
              collaborator, then document and confirm
              the action.
            </p>
          </header>

          {organizations.length === 0 &&
          !loadingOrganizations ? (
            <EmptyState
              title="No Organizations available"
              description="There is currently no Organization available for a scoped intervention."
            />
          ) : (
            <>
              <section className="interventionStep">
                <div className="interventionStepNumber">
                  1
                </div>

                <div className="interventionStepContent">
                  <div>
                    <strong>
                      Choose the Organization
                    </strong>

                    <span>
                      This establishes the intervention
                      boundary.
                    </span>
                  </div>

                  <label>
                    Organization

                    <select
                      name="organizationId"
                      value={organizationId}
                      onChange={(event) =>
                        setOrganizationId(
                          event.target.value,
                        )
                      }
                      disabled={
                        loadingOrganizations
                      }
                      required
                    >
                      <option value="">
                        {loadingOrganizations
                          ? 'Loading Organizations…'
                          : 'Select an Organization'}
                      </option>

                      {organizations.map(
                        (organization) => (
                          <option
                            key={
                              organization.id
                            }
                            value={
                              organization.id
                            }
                          >
                            {
                              organization.name
                            }{' '}
                            ·{' '}
                            {
                              organization.accessStatus
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
              </section>

              <section className="interventionStep">
                <div className="interventionStepNumber">
                  2
                </div>

                <div className="interventionStepContent">
                  <div>
                    <strong>
                      Choose the collaborator
                    </strong>

                    <span>
                      Owners are deliberately excluded
                      from this intervention path.
                    </span>
                  </div>

                  <label>
                    Eligible collaborator

                    <select
                      name="membershipId"
                      value={membershipId}
                      onChange={(event) =>
                        setMembershipId(
                          event.target.value,
                        )
                      }
                      disabled={
                        !organizationId ||
                        loadingCandidates
                      }
                      required
                    >
                      <option value="">
                        {loadingCandidates
                          ? 'Loading eligible collaborators…'
                          : 'Select an active non-owner collaborator'}
                      </option>

                      {candidates.map(
                        (candidate) => (
                          <option
                            key={
                              candidate.id
                            }
                            value={
                              candidate.id
                            }
                          >
                            {
                              candidate
                                .identity.email
                            }{' '}
                            ·{' '}
                            {
                              candidate.profile
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  {organizationId &&
                    !loadingCandidates &&
                    candidates.length === 0 && (
                      <div className="interventionNoCandidates">
                        No eligible active non-owner
                        collaborators were found.
                      </div>
                    )}

                  {selectedCandidate && (
                    <div className="interventionCandidateCard">
                      <div>
                        <span>
                          Selected collaborator
                        </span>

                        <strong>
                          {
                            selectedCandidate
                              .identity.email
                          }
                        </strong>
                      </div>

                      <div className="interventionCandidateMeta">
                        <span>
                          {
                            selectedCandidate.profile
                          }
                        </span>

                        <StatusBadge
                          status={
                            selectedCandidate.status
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="interventionStep">
                <div className="interventionStepNumber">
                  3
                </div>

                <div className="interventionStepContent">
                  <div>
                    <strong>
                      Document and confirm
                    </strong>

                    <span>
                      The reason is recorded as evidence
                      for this sensitive action.
                    </span>
                  </div>

                  <label>
                    Reason

                    <textarea
                      name="reason"
                      placeholder="Describe the support or security reason"
                      required
                      disabled={!membershipId}
                    />
                  </label>

                  <CheckboxRow
                    name="confirmed"
                    title="I confirm this narrowly scoped intervention"
                    description="The collaborator will immediately lose access and active sessions will be revoked."
                    required
                  />
                </div>
              </section>

              <div className="interventionActions">
                <a
                  className="button buttonSecondary"
                  href="/platform/directory"
                >
                  Cancel
                </a>

                <button
                  className="dangerButton"
                  disabled={
                    submitting ||
                    !organizationId ||
                    !membershipId
                  }
                >
                  {submitting
                    ? 'Suspending…'
                    : 'Suspend collaborator'}
                </button>
              </div>
            </>
          )}
        </form>
      </section>
    </AppShell>
  );
}

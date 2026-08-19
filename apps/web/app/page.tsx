'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import './styles.css';

import {
  AppShell,
  EmptyState,
  PageHeader,
  StatusBadge,
  tenantNav,
} from './components/ui';

type CurrentIdentity = {
  email: string;
  membership: {
    profile: string;
    organization: {
      name: string;
    };
  } | null;
  platformPrincipal: {
    id: string;
  } | null;
};

type Company = {
  id: string;
  name: string;
  status: string;
  _count: {
    businessScopes: number;
  };
};

type Collaborator = {
  id: string;
  status: string;
  profile: string;
  identity: {
    email: string;
  };
};

function csrfToken():
  | string
  | undefined {
  return document.cookie
    .split('; ')
    .find((item) =>
      item.startsWith('nova_csrf='),
    )
    ?.split('=')[1];
}

export default function HomePage() {
  const [identity, setIdentity] =
    useState<CurrentIdentity | null>(
      null,
    );

  const [companies, setCompanies] =
    useState<Company[]>([]);

  const [
    collaborators,
    setCollaborators,
  ] = useState<Collaborator[]>([]);

  useEffect(() => {
    void fetch('/api/auth/me', {
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) {
          window.location.replace(
            '/login',
          );
          return;
        }

        const body =
          (await response.json()) as {
            identity: CurrentIdentity;
          };

        if (
          body.identity
            .platformPrincipal &&
          !body.identity.membership
        ) {
          window.location.replace(
            '/platform',
          );
          return;
        }

        setIdentity(body.identity);

        void Promise.all([
          fetch(
            '/api/organizations/companies',
            {
              credentials: 'include',
            },
          ),

          fetch('/api/collaborators', {
            credentials: 'include',
          }),
        ]).then(
          async ([
            companyResponse,
            collaboratorResponse,
          ]) => {
            if (companyResponse.ok) {
              setCompanies(
                (await companyResponse.json()) as Company[],
              );
            }

            if (
              collaboratorResponse.ok
            ) {
              setCollaborators(
                (await collaboratorResponse.json()) as Collaborator[],
              );
            }
          },
        );
      })
      .catch(() =>
        window.location.replace(
          '/login',
        ),
      );
  }, []);

  async function logout() {
    const token = csrfToken();

    const response = await fetch(
      '/api/auth/logout',
      {
        method: 'DELETE',
        credentials: 'include',
        headers: token
          ? {
              'X-CSRF-Token': token,
            }
          : {},
      },
    );

    if (response.ok) {
      window.location.assign(
        '/login',
      );
    }
  }

  const activeCollaborators =
    useMemo(
      () =>
        collaborators.filter(
          (item) =>
            item.status === 'ACTIVE',
        ).length,
      [collaborators],
    );

  const scopeCount =
    useMemo(
      () =>
        companies.reduce(
          (sum, company) =>
            sum +
            company._count
              .businessScopes,
          0,
        ),
      [companies],
    );

  if (!identity) {
    return (
      <main className="sessionLoading">
        <span className="loadingMark">
          N
        </span>

        <strong>
          Checking your NOVA session…
        </strong>
      </main>
    );
  }

  const organizationName =
    identity.membership?.organization
      .name ?? 'NOVA Platform';

  const profile =
    identity.membership?.profile ??
    'Platform Administrator';

  const administrator =
    profile === 'Administrator';

  return (
    <AppShell
      area={organizationName}
      active="/"
      items={
        administrator
          ? tenantNav
          : tenantNav.filter(
              (item) =>
                item.href === '/' ||
                item.href ===
                  '/portfolio',
            )
      }
      footer={
        <>
          <strong>
            {identity.email}
          </strong>
          <br />
          {profile}
        </>
      }
    >
      <PageHeader
        eyebrow="Organization overview"
        title={organizationName}
        description={
          administrator
            ? 'Monitor your Organization structure, collaborators, access, and governance from one place.'
            : 'Review the Companies and Business Scopes currently authorized for your account.'
        }
        actions={
          <button
            className="secondary"
            type="button"
            onClick={() =>
              void logout()
            }
          >
            Sign out
          </button>
        }
      />

      <section className="dashboardStatsRedesigned">
        <article>
          <span>Companies</span>
          <strong>
            {companies.length}
          </strong>
          <small>
            Authorized records
          </small>
        </article>

        <article>
          <span>Business scopes</span>
          <strong>
            {scopeCount}
          </strong>
          <small>
            Visible operational scopes
          </small>
        </article>

        <article>
          <span>Collaborators</span>
          <strong>
            {collaborators.length}
          </strong>
          <small>
            {activeCollaborators} active
          </small>
        </article>

        <article>
          <span>Your profile</span>
          <strong className="dashboardProfileValue">
            {profile}
          </strong>
          <small>
            Current Organization role
          </small>
        </article>
      </section>

      <section className="dashboardWorkspace">
        <section className="dashboardPanel">
          <header className="dashboardPanelHeader">
            <div>
              <span className="sectionEyebrow">
                Portfolio
              </span>

              <h2>
                Companies & business scopes
              </h2>
            </div>

            <a href="/portfolio">
              Open portfolio →
            </a>
          </header>

          {companies.length ? (
            <div className="dashboardCompactList">
              {companies
                .slice(0, 6)
                .map((company) => (
                  <a
                    href="/portfolio"
                    key={company.id}
                    className="dashboardCompactRow"
                  >
                    <span>
                      <strong>
                        {company.name}
                      </strong>

                      <small>
                        {
                          company._count
                            .businessScopes
                        }{' '}
                        business scope
                        {company._count
                          .businessScopes ===
                        1
                          ? ''
                          : 's'}
                      </small>
                    </span>

                    <StatusBadge
                      status={
                        company.status
                      }
                    />
                  </a>
                ))}
            </div>
          ) : (
            <EmptyState
              title="No Companies yet"
              description={
                administrator
                  ? 'Create the first Company to start building your Organization structure.'
                  : 'No Company is currently visible to your account.'
              }
              action={
                administrator ? (
                  <a
                    className="button"
                    href="/administration/companies"
                  >
                    Add Company
                  </a>
                ) : undefined
              }
            />
          )}
        </section>

        <section className="dashboardPanel">
          <header className="dashboardPanelHeader">
            <div>
              <span className="sectionEyebrow">
                People
              </span>

              <h2>
                Collaborators
              </h2>
            </div>

            {administrator && (
              <a href="/administration/collaborators">
                Manage people →
              </a>
            )}
          </header>

          {collaborators.length ? (
            <div className="dashboardCompactList">
              {collaborators
                .slice(0, 6)
                .map((member) => (
                  <a
                    href={
                      administrator
                        ? '/administration/collaborators'
                        : '/portfolio'
                    }
                    key={member.id}
                    className="dashboardCompactRow"
                  >
                    <span>
                      <strong>
                        {
                          member
                            .identity.email
                        }
                      </strong>

                      <small>
                        {member.profile}
                      </small>
                    </span>

                    <StatusBadge
                      status={
                        member.status
                      }
                    />
                  </a>
                ))}
            </div>
          ) : (
            <EmptyState
              title="No collaborators yet"
              description="No collaborator accounts have been added to this Organization."
              action={
                administrator ? (
                  <a
                    className="button"
                    href="/administration/collaborators"
                  >
                    Invite collaborator
                  </a>
                ) : undefined
              }
            />
          )}
        </section>
      </section>

      {administrator && (
        <section className="dashboardActionsPanel">
          <header>
            <span className="sectionEyebrow">
              Administration
            </span>

            <h2>
              Common actions
            </h2>

            <p>
              Jump directly to the areas you
              manage most often.
            </p>
          </header>

          <nav className="dashboardActionGrid">
            <a href="/administration/companies">
              <span>01</span>

              <div>
                <strong>
                  Structure
                </strong>

                <small>
                  Companies and Business
                  Scopes
                </small>
              </div>
            </a>

            <a href="/administration/collaborators">
              <span>02</span>

              <div>
                <strong>
                  Collaborators
                </strong>

                <small>
                  Invitations and access
                  lifecycle
                </small>
              </div>
            </a>

            <a href="/administration/permissions">
              <span>03</span>

              <div>
                <strong>
                  Permissions
                </strong>

                <small>
                  Capabilities and scoped
                  assignments
                </small>
              </div>
            </a>

            <a href="/administration/ownership">
              <span>04</span>

              <div>
                <strong>
                  Governance
                </strong>

                <small>
                  Promotion and ownership
                  transfer
                </small>
              </div>
            </a>
          </nav>
        </section>
      )}
    </AppShell>
  );
}

'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import '../styles.css';

import {
  AppShell,
  EmptyState,
  PageHeader,
  StatusBadge,
  tenantNav,
} from '../components/ui';

type Company = {
  id: string;
  name: string;
  status: string;
  _count: {
    businessScopes: number;
  };
};

type Scope = {
  id: string;
  name: string;
  type: string;
  status: string;
  externalIdentifier: string | null;
  location: string | null;
  responsiblePerson: string | null;
  sectorCounterpart: string | null;
  company: {
    id: string;
    name: string;
  };
};

type Identity = {
  email: string;
  membership: {
    profile: string;
    organization: {
      name: string;
    };
  } | null;
};

type PortfolioView =
  | 'scopes'
  | 'companies';

export default function PortfolioPage() {
  const [identity, setIdentity] =
    useState<Identity | null>(null);

  const [companies, setCompanies] =
    useState<Company[]>([]);

  const [scopes, setScopes] =
    useState<Scope[]>([]);

  const [selectedScope, setSelectedScope] =
    useState<Scope | null>(null);

  const [selectedCompany, setSelectedCompany] =
    useState<Company | null>(null);

  const [view, setView] =
    useState<PortfolioView>('scopes');

  const [query, setQuery] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const activeRequest =
    useRef<AbortController | null>(null);

  const load = useCallback(
    async (search = '') => {
      activeRequest.current?.abort();

      const controller =
        new AbortController();

      activeRequest.current =
        controller;

      setLoading(true);
      setError('');

      const suffix = search.trim()
        ? `?q=${encodeURIComponent(
            search.trim(),
          )}`
        : '';

      try {
        const [
          identityResponse,
          companiesResponse,
          scopesResponse,
        ] = await Promise.all([
          fetch('/api/auth/me', {
            credentials: 'include',
            signal: controller.signal,
          }),

          fetch(
            `/api/organizations/companies${suffix}`,
            {
              credentials: 'include',
              signal: controller.signal,
            },
          ),

          fetch(
            `/api/organizations/business-scopes${suffix}`,
            {
              credentials: 'include',
              signal: controller.signal,
            },
          ),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        if (
          !identityResponse.ok ||
          !companiesResponse.ok ||
          !scopesResponse.ok
        ) {
          setError(
            'Your authorized portfolio could not be loaded.',
          );
          return;
        }

        const identityBody =
          (await identityResponse.json()) as {
            identity: Identity;
          };

        const nextCompanies =
          (await companiesResponse.json()) as Company[];

        const nextScopes =
          (await scopesResponse.json()) as Scope[];

        setIdentity(identityBody.identity);
        setCompanies(nextCompanies);
        setScopes(nextScopes);

        setSelectedScope((current) =>
          nextScopes.find(
            (scope) =>
              scope.id === current?.id,
          ) ??
          nextScopes[0] ??
          null,
        );

        setSelectedCompany((current) =>
          nextCompanies.find(
            (company) =>
              company.id === current?.id,
          ) ??
          nextCompanies[0] ??
          null,
        );
      } catch (requestError) {
        if (
          !(
            requestError instanceof DOMException &&
            requestError.name ===
              'AbortError'
          )
        ) {
          setError(
            'Your authorized portfolio could not be loaded.',
          );
        }
      } finally {
        if (
          activeRequest.current ===
          controller
        ) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void load();

    return () =>
      activeRequest.current?.abort();
  }, [load]);

  function search(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    void load(query);
  }

  const organizationName =
    identity?.membership?.organization
      .name ?? 'Your Organization';

  const profile =
    identity?.membership?.profile ??
    'User';

  const navigation =
    profile === 'Administrator'
      ? tenantNav
      : tenantNav.filter(
          (item) =>
            item.href === '/' ||
            item.href === '/portfolio',
        );

  return (
    <AppShell
      area={organizationName}
      active="/portfolio"
      items={navigation}
      footer={
        identity
          ? `${identity.email} · ${profile}`
          : 'Authorized portfolio'
      }
    >
      <PageHeader
        eyebrow="Authorized portfolio"
        title="Companies & business scopes"
        description="Browse the operational records currently available to your account."
        actions={
          profile ===
          'Administrator' ? (
            <a
              className="button"
              href="/administration/companies"
            >
              Manage structure
            </a>
          ) : undefined
        }
      />

      <section className="portfolioV2Toolbar">
        <form
          className="portfolioV2Search"
          onSubmit={search}
          role="search"
        >
          <input
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search companies, scopes, locations or identifiers…"
            aria-label="Search portfolio"
          />

          <button disabled={loading}>
            {loading
              ? 'Searching…'
              : 'Search'}
          </button>
        </form>

        <div
          className="portfolioV2Tabs"
          role="tablist"
          aria-label="Portfolio view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={
              view === 'scopes'
            }
            className={
              view === 'scopes'
                ? 'portfolioV2Tab portfolioV2TabActive'
                : 'portfolioV2Tab'
            }
            onClick={() =>
              setView('scopes')
            }
          >
            Business scopes
            <span>{scopes.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={
              view === 'companies'
            }
            className={
              view === 'companies'
                ? 'portfolioV2Tab portfolioV2TabActive'
                : 'portfolioV2Tab'
            }
            onClick={() =>
              setView('companies')
            }
          >
            Companies
            <span>{companies.length}</span>
          </button>
        </div>
      </section>

      {error && (
        <div
          className="feedback feedback-danger"
          role="alert"
        >
          {error}
        </div>
      )}

      <section className="portfolioV2Workspace">
        <div className="portfolioV2Directory">
          <header className="portfolioV2DirectoryHeader">
            <div>
              <span className="sectionEyebrow">
                {view === 'scopes'
                  ? 'Operational scopes'
                  : 'Company directory'}
              </span>

              <h2>
                {view === 'scopes'
                  ? 'Business scopes'
                  : 'Companies'}
              </h2>
            </div>

            <span>
              {view === 'scopes'
                ? `${scopes.length} visible`
                : `${companies.length} visible`}
            </span>
          </header>

          {loading ? (
            <div className="portfolioV2Loading">
              Loading portfolio…
            </div>
          ) : view === 'scopes' ? (
            scopes.length ? (
              <div className="portfolioV2List">
                {scopes.map((scope) => (
                  <button
                    type="button"
                    key={scope.id}
                    className={
                      selectedScope?.id ===
                      scope.id
                        ? 'portfolioV2Row portfolioV2RowSelected'
                        : 'portfolioV2Row'
                    }
                    onClick={() =>
                      setSelectedScope(
                        scope,
                      )
                    }
                  >
                    <span className="portfolioV2RowMain">
                      <strong>
                        {scope.name}
                      </strong>

                      <small>
                        {scope.company.name}
                        {' · '}
                        {scope.type.replaceAll(
                          '_',
                          ' ',
                        )}
                        {scope.location
                          ? ` · ${scope.location}`
                          : ''}
                      </small>
                    </span>

                    <StatusBadge
                      status={
                        scope.status
                      }
                    />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No business scopes found"
                description="No authorized Business Scope matches the current search."
              />
            )
          ) : companies.length ? (
            <div className="portfolioV2List">
              {companies.map(
                (company) => (
                  <button
                    type="button"
                    key={company.id}
                    className={
                      selectedCompany?.id ===
                      company.id
                        ? 'portfolioV2Row portfolioV2RowSelected'
                        : 'portfolioV2Row'
                    }
                    onClick={() =>
                      setSelectedCompany(
                        company,
                      )
                    }
                  >
                    <span className="portfolioV2RowMain">
                      <strong>
                        {company.name}
                      </strong>

                      <small>
                        {
                          company._count
                            .businessScopes
                        }{' '}
                        visible business scope
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
                  </button>
                ),
              )}
            </div>
          ) : (
            <EmptyState
              title="No companies found"
              description="No authorized Company matches the current search."
            />
          )}
        </div>

        <aside className="portfolioV2Detail">
          {view === 'scopes' ? (
            selectedScope ? (
              <>
                <header className="portfolioV2DetailHeader">
                  <div>
                    <span className="sectionEyebrow">
                      Business scope
                    </span>

                    <h2>
                      {selectedScope.name}
                    </h2>

                    <p>
                      {
                        selectedScope
                          .company.name
                      }
                    </p>
                  </div>

                  <StatusBadge
                    status={
                      selectedScope.status
                    }
                  />
                </header>

                <dl className="portfolioV2Meta">
                  <div>
                    <dt>Type</dt>
                    <dd>
                      {selectedScope.type.replaceAll(
                        '_',
                        ' ',
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>Company</dt>
                    <dd>
                      {
                        selectedScope
                          .company.name
                      }
                    </dd>
                  </div>

                  <div>
                    <dt>
                      External identifier
                    </dt>
                    <dd>
                      {selectedScope.externalIdentifier ||
                        'Not provided'}
                    </dd>
                  </div>

                  <div>
                    <dt>Location</dt>
                    <dd>
                      {selectedScope.location ||
                        'Not provided'}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Responsible person
                    </dt>
                    <dd>
                      {selectedScope.responsiblePerson ||
                        'Not provided'}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Sector counterpart
                    </dt>
                    <dd>
                      {selectedScope.sectorCounterpart ||
                        'Not provided'}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <EmptyState
                title="Select a business scope"
                description="Choose a Business Scope to inspect its details."
              />
            )
          ) : selectedCompany ? (
            <>
              <header className="portfolioV2DetailHeader">
                <div>
                  <span className="sectionEyebrow">
                    Company
                  </span>

                  <h2>
                    {selectedCompany.name}
                  </h2>

                  <p>
                    Organization Company
                  </p>
                </div>

                <StatusBadge
                  status={
                    selectedCompany.status
                  }
                />
              </header>

              <dl className="portfolioV2Meta">
                <div>
                  <dt>Status</dt>
                  <dd>
                    {selectedCompany.status}
                  </dd>
                </div>

                <div>
                  <dt>
                    Visible business scopes
                  </dt>
                  <dd>
                    {
                      selectedCompany._count
                        .businessScopes
                    }
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <EmptyState
              title="Select a Company"
              description="Choose a Company to inspect its details."
            />
          )}

          <footer className="portfolioV2DetailFooter">
            Access is resolved from your
            current effective grants.
          </footer>
        </aside>
      </section>
    </AppShell>
  );
}

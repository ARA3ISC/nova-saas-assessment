'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import '../../styles.css';

import {
  AppShell,
  CheckboxRow,
  Dialog,
  DialogActions,
  Feedback,
  PageHeader,
  StatusBadge,
  tenantNav,
} from '../../components/ui';

type Company = {
  id: string;
  name: string;
  status: string;
  version: number;
  _count: {
    businessScopes: number;
  };
};

type Scope = {
  id: string;
  name: string;
  type: string;
  status: string;
  version: number;
  externalIdentifier: string | null;
  location: string | null;
  responsiblePerson: string | null;
  sectorCounterpart: string | null;

  company: {
    name: string;
  };
};

type ScopeDraft = {
  companyId: string;
  companyName: string;
  type: string;
  name: string;
  externalIdentifier: string;
  location: string;
  responsiblePerson: string;
  sectorCounterpart: string;
};

type LifecycleTarget = {
  kind: 'company' | 'scope';
  id: string;
  name: string;
  status: string;
};

function csrf(): string | undefined {
  return document.cookie
    .split('; ')
    .find((part) =>
      part.startsWith('nova_csrf='),
    )
    ?.split('=')[1];
}

async function mutation(
  path: string,
  method: string,
  body: object,
) {
  const token = csrf();

  return fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',

      ...(token
        ? {
          'X-CSRF-Token': token,
        }
        : {}),
    },

    body: JSON.stringify(body),
  });
}

async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body =
      (await response.json()) as {
        detail?: string;
        message?: string | string[];
        correlationId?: string;
      };

    const message = Array.isArray(
      body.message,
    )
      ? body.message.join(', ')
      : (body.detail ??
        body.message ??
        fallback);

    return `${message}${body.correlationId
      ? ` Reference: ${body.correlationId}`
      : ''
      }`;
  } catch {
    return fallback;
  }
}



export default function CompaniesPage() {

  const [lifecycleError, setLifecycleError] =
    useState('');

  const [companies, setCompanies] =
    useState<Company[]>([]);

  const [scopes, setScopes] =
    useState<Scope[]>([]);

  const [message, setMessage] =
    useState('');

  const [messageTone, setMessageTone] =
    useState<'success' | 'danger'>(
      'success',
    );

  const [loading, setLoading] =
    useState(true);

  const [searchQuery, setSearchQuery] =
    useState('');

  const [companyDialogOpen, setCompanyDialogOpen] =
    useState(false);

  const [scopeDialogOpen, setScopeDialogOpen] =
    useState(false);

  const [scopeDraft, setScopeDraft] =
    useState<ScopeDraft | null>(null);

  const [scopeDialogError, setScopeDialogError] =
    useState('');

  const [
    editingCompanyId,
    setEditingCompanyId,
  ] = useState<string | null>(null);

  const [
    editingScopeId,
    setEditingScopeId,
  ] = useState<string | null>(null);

  const [
    lifecycleTarget,
    setLifecycleTarget,
  ] = useState<LifecycleTarget | null>(
    null,
  );

  const activeSearch =
    useRef<AbortController | null>(
      null,
    );

  const scopeForm =
    useRef<HTMLFormElement | null>(
      null,
    );

  // function closeScopeDialog() {
  //   setScopeDraft(null);
  //   setScopeDialogOpen(false);
  // }
  const refresh = useCallback(
    async (query = '') => {
      activeSearch.current?.abort();

      const controller =
        new AbortController();

      activeSearch.current =
        controller;

      setLoading(true);

      try {
        const suffix = query.trim()
          ? `?q=${encodeURIComponent(
            query.trim(),
          )}`
          : '';

        const [
          companyResponse,
          scopeResponse,
        ] = await Promise.all([
          fetch(
            `/api/organizations/companies${suffix}`,
            {
              credentials: 'include',
              signal:
                controller.signal,
            },
          ),

          fetch(
            `/api/organizations/business-scopes${suffix}`,
            {
              credentials: 'include',
              signal:
                controller.signal,
            },
          ),
        ]);

        if (
          controller.signal.aborted
        ) {
          return;
        }

        if (companyResponse.ok) {
          setCompanies(
            (await companyResponse.json()) as Company[],
          );
        }

        if (scopeResponse.ok) {
          setScopes(
            (await scopeResponse.json()) as Scope[],
          );
        }
      } catch (error) {
        if (
          !(
            error instanceof DOMException &&
            error.name === 'AbortError'
          )
        ) {
          setMessageTone('danger');
          setMessage(
            'The organization structure could not be loaded.',
          );
        }
      } finally {
        if (
          activeSearch.current ===
          controller
        ) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void refresh();

    return () =>
      activeSearch.current?.abort();
  }, [refresh]);

  function search(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    void refresh(searchQuery);
  }

  async function createCompany(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const formElement =
      event.currentTarget;

    const form =
      new FormData(formElement);

    const response = await mutation(
      '/organizations/companies',
      'POST',
      {
        name: form.get('name'),
      },
    );

    if (response.ok) {
      setMessageTone('success');
      setMessage('Company created.');

      formElement.reset();

      setCompanyDialogOpen(false);

      await refresh(searchQuery);
      return;
    }

    setMessageTone('danger');

    setMessage(
      await errorMessage(
        response,
        'Company creation failed.',
      ),
    );
  }

  async function renameCompany(
    event: FormEvent<HTMLFormElement>,
    companyId: string,
  ) {
    event.preventDefault();

    const form =
      new FormData(
        event.currentTarget,
      );

    const company =
      companies.find(
        (item) =>
          item.id === companyId,
      );

    const response = await mutation(
      `/organizations/companies/${companyId}`,
      'PATCH',
      {
        name: form.get('name'),
        expectedVersion:
          company?.version,
      },
    );

    if (response.ok) {
      setMessageTone('success');
      setMessage('Company updated.');

      setEditingCompanyId(null);

      await refresh(searchQuery);
      return;
    }

    setMessageTone('danger');

    setMessage(
      await errorMessage(
        response,
        'Company update failed.',
      ),
    );
  }

  async function updateScope(
    event: FormEvent<HTMLFormElement>,
    scopeId: string,
  ) {
    event.preventDefault();

    const form =
      new FormData(
        event.currentTarget,
      );

    const scope =
      scopes.find(
        (item) =>
          item.id === scopeId,
      );

    const response = await mutation(
      `/organizations/business-scopes/${scopeId}`,
      'PATCH',
      {
        type: form.get('type'),
        name: form.get('name'),

        externalIdentifier:
          form.get(
            'externalIdentifier',
          ),

        location:
          form.get('location'),

        responsiblePerson:
          form.get(
            'responsiblePerson',
          ),

        sectorCounterpart:
          form.get(
            'sectorCounterpart',
          ),

        expectedVersion:
          scope?.version,
      },
    );

    if (response.ok) {
      setMessageTone('success');

      setMessage(
        'Business Scope updated.',
      );

      setEditingScopeId(null);

      await refresh(searchQuery);
      return;
    }

    setMessageTone('danger');

    setMessage(
      await errorMessage(
        response,
        'Business Scope update failed.',
      ),
    );
  }

  async function reviewScope(
    event: FormEvent<HTMLFormElement>,
  ) {
    setScopeDialogError('');
    event.preventDefault();

    const form =
      new FormData(
        event.currentTarget,
      );

    const body = {
      companyId: String(
        form.get('companyId'),
      ),

      type: String(
        form.get('type'),
      ),

      name: String(
        form.get('name'),
      ).trim(),

      externalIdentifier: String(
        form.get(
          'externalIdentifier',
        ),
      ).trim(),

      location: String(
        form.get('location'),
      ).trim(),

      responsiblePerson: String(
        form.get(
          'responsiblePerson',
        ),
      ).trim(),

      sectorCounterpart: String(
        form.get(
          'sectorCounterpart',
        ),
      ).trim(),
    };

    const duplicate =
      await mutation(
        '/organizations/business-scopes/duplicate-check',
        'POST',
        body,
      );

    if (!duplicate.ok) {
      setScopeDialogError(
        await errorMessage(
          duplicate,
          'Duplicate check failed.',
        ),
      );

      return;
    }

    const duplicateBody = await duplicate
      .json()
      .catch(() => null);

    if (duplicateBody) {
      setScopeDialogError(
        `A matching Business Scope already exists${duplicateBody.name
          ? `: ${duplicateBody.name}`
          : ''
        }.`,
      );

      return;
    }

    const company =
      companies.find(
        (candidate) =>
          candidate.id ===
          body.companyId,
      );

    if (!company) {
      setScopeDialogError(
        'Select an active Company.',
      );

      return;
    }

    setScopeDraft({
      ...body,
      companyName:
        company.name,
    });
  }

  async function confirmScope() {
    if (!scopeDraft) {
      return;
    }

    setScopeDialogError('');

    const response = await mutation(
      '/organizations/business-scopes',
      'POST',
      {
        companyId:
          scopeDraft.companyId,

        type: scopeDraft.type,

        name: scopeDraft.name,

        externalIdentifier:
          scopeDraft.externalIdentifier,

        location:
          scopeDraft.location,

        responsiblePerson:
          scopeDraft.responsiblePerson,

        sectorCounterpart:
          scopeDraft.sectorCounterpart,

        confirmed: true,
      },
    );

    if (response.ok) {
      setScopeDialogError('');

      setMessageTone('success');
      setMessage(
        'Business Scope created.',
      );

      scopeForm.current?.reset();

      setScopeDraft(null);
      setScopeDialogOpen(false);

      await refresh(searchQuery);

      return;
    }

    setScopeDialogError(
      await errorMessage(
        response,
        'Business Scope creation failed.',
      ),
    );
  }

  async function changeLifecycle(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!lifecycleTarget) {
      return;
    }

    setLifecycleError('');

    const form =
      new FormData(
        event.currentTarget,
      );

    const action =
      lifecycleTarget.status ===
        'ACTIVE'
        ? 'deactivate'
        : 'reactivate';

    const resource =
      lifecycleTarget.kind ===
        'company'
        ? 'companies'
        : 'business-scopes';

    const response =
      await mutation(
        `/organizations/${resource}/${lifecycleTarget.id}/${action}`,
        'PATCH',
        {
          reason:
            form.get('reason'),

          confirmed:
            form.get(
              'confirmed',
            ) === 'on',
        },
      );

    if (response.ok) {
      setMessageTone('success');

      setMessage(
        `${lifecycleTarget.kind ===
          'company'
          ? 'Company'
          : 'Business Scope'
        } ${action ===
          'reactivate'
          ? 'reactivated'
          : 'deactivated'
        }.`,
      );

      setLifecycleTarget(null);

      await refresh(searchQuery);

      return;
    }

    setLifecycleError(
      await errorMessage(
        response,
        'Lifecycle change failed. Check parent and child states.',
      ),
    );

    if (response.ok) {
      setLifecycleError('');

      setMessageTone('success');

      setMessage(
        `${lifecycleTarget.kind === 'company'
          ? 'Company'
          : 'Business Scope'
        } ${action === 'reactivate'
          ? 'reactivated'
          : 'deactivated'
        }.`,
      );

      setLifecycleTarget(null);

      await refresh(searchQuery);

      return;
    }
  }

  const activeCompanies =
    companies.filter(
      (company) =>
        company.status ===
        'ACTIVE',
    );

  return (
    <AppShell
      area="Organization administration"
      active="/administration/companies"
      items={tenantNav}
      footer="Current Organization context"
      requiredAccess="organization-administrator"
    >
      <PageHeader
        eyebrow="Operational structure"
        title="Companies & business scopes"
        description="Manage the legal and operational structure of your Organization."
        actions={
          <>
            <button
              type="button"
              onClick={() => {
                setScopeDraft(null);

                setCompanyDialogOpen(
                  true,
                );
              }}
            >
              + Add company
            </button>

            <button
              className="secondaryAction"
              type="button"
              onClick={() => {
                setScopeDraft(null);

                setScopeDialogOpen(
                  true,
                );
              }}
            >
              + Add business scope
            </button>
          </>
        }
      />

      {message && (
        <Feedback tone={messageTone}>
          {message}
        </Feedback>
      )}

      <section className="structureDirectory">
        <div className="structureDirectoryHeader">
          <div>
            <span className="sectionEyebrow">
              Current structure
            </span>

            <h2>
              Organization directory
            </h2>

            <p>
              Search, review and manage
              Companies and their operational
              Business Scopes.
            </p>
          </div>

          <form
            className="structureSearch"
            role="search"
            onSubmit={search}
          >
            <input
              value={searchQuery}
              onChange={(event) =>
                setSearchQuery(
                  event.target.value,
                )
              }
              placeholder="Search records…"
              aria-label="Search organization structure"
            />

            <button
              className="secondaryAction"
              disabled={loading}
            >
              {loading
                ? 'Searching…'
                : 'Search'}
            </button>
          </form>
        </div>

        {loading ? (
          <div
            className="directoryLoading"
            role="status"
          >
            Loading organization
            structure…
          </div>
        ) : (
          <div className="structureDirectoryGrid">
            <section className="structureColumn">
              <header className="structureColumnHeader">
                <div>
                  <strong>
                    Companies
                  </strong>

                  <span>
                    {companies.length}{' '}
                    total
                  </span>
                </div>
              </header>

              <div className="structureScrollableList">
                {companies.length ===
                  0 ? (
                  <div className="structureEmpty">
                    <strong>
                      No Companies found
                    </strong>

                    <span>
                      Create the first
                      Company to start
                      building your
                      Organization.
                    </span>
                  </div>
                ) : (
                  companies.map(
                    (company) => (
                      <article
                        key={
                          company.id
                        }
                        className="structureRecord"
                      >
                        <div className="structureRecordMain">
                          <span className="structureRecordTitle">
                            <strong>
                              {
                                company.name
                              }
                            </strong>

                            <small>
                              {
                                company
                                  ._count
                                  .businessScopes
                              }{' '}
                              business
                              scope
                              {company
                                ._count
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
                        </div>

                        <div className="structureRowActions">
                          <button
                            type="button"
                            className="structureRowAction"
                            onClick={() =>
                              setEditingCompanyId(
                                company.id,
                              )
                            }
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="structureRowAction"
                            onClick={() =>
                              setLifecycleTarget(
                                {
                                  kind: 'company',
                                  id: company.id,
                                  name: company.name,
                                  status:
                                    company.status,
                                },
                              )
                            }
                          >
                            {company.status ===
                              'ACTIVE'
                              ? 'Deactivate'
                              : 'Reactivate'}
                          </button>
                        </div>

                        <Dialog
                          open={
                            editingCompanyId ===
                            company.id
                          }
                          onClose={() =>
                            setEditingCompanyId(
                              null,
                            )
                          }
                          title="Edit company"
                          description="Update the Company name without changing its Organization or access assignments."
                          size="small"
                        >
                          <form
                            onSubmit={(
                              event,
                            ) =>
                              void renameCompany(
                                event,
                                company.id,
                              )
                            }
                          >
                            <label>
                              Company name

                              <input
                                name="name"
                                defaultValue={
                                  company.name
                                }
                                required
                              />
                            </label>

                            <DialogActions>
                              <button
                                type="button"
                                className="secondaryAction"
                                onClick={() =>
                                  setEditingCompanyId(
                                    null,
                                  )
                                }
                              >
                                Cancel
                              </button>

                              <button>
                                Save company
                              </button>
                            </DialogActions>
                          </form>
                        </Dialog>
                      </article>
                    ),
                  )
                )}
              </div>
            </section>

            <section className="structureColumn">
              <header className="structureColumnHeader">
                <div>
                  <strong>
                    Business scopes
                  </strong>

                  <span>
                    {scopes.length}{' '}
                    total
                  </span>
                </div>
              </header>

              <div className="structureScrollableList">
                {scopes.length === 0 ? (
                  <div className="structureEmpty">
                    <strong>
                      No Business Scopes
                      found
                    </strong>

                    <span>
                      Add a Business Scope
                      once an active Company
                      exists.
                    </span>
                  </div>
                ) : (
                  scopes.map(
                    (scope) => (
                      <article
                        key={scope.id}
                        className="structureRecord"
                      >
                        <div className="structureRecordMain">
                          <span className="structureRecordTitle">
                            <strong>
                              {scope.name}
                            </strong>

                            <small>
                              {
                                scope
                                  .company
                                  .name
                              }
                              {' · '}
                              {scope.type.replaceAll(
                                '_',
                                ' ',
                              )}
                            </small>
                          </span>

                          <StatusBadge
                            status={
                              scope.status
                            }
                          />
                        </div>

                        {(scope.location ||
                          scope.responsiblePerson) && (
                            <div className="structureRecordMeta">
                              {scope.location && (
                                <span>
                                  {
                                    scope.location
                                  }
                                </span>
                              )}

                              {scope.responsiblePerson && (
                                <span>
                                  {
                                    scope.responsiblePerson
                                  }
                                </span>
                              )}
                            </div>
                          )}

                        <div className="structureRowActions">
                          <button
                            type="button"
                            className="structureRowAction"
                            onClick={() =>
                              setEditingScopeId(
                                scope.id,
                              )
                            }
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="structureRowAction"
                            onClick={() =>
                              setLifecycleTarget(
                                {
                                  kind: 'scope',
                                  id: scope.id,
                                  name: scope.name,
                                  status:
                                    scope.status,
                                },
                              )
                            }
                          >
                            {scope.status ===
                              'ACTIVE'
                              ? 'Deactivate'
                              : 'Reactivate'}
                          </button>
                        </div>

                        <Dialog
                          open={
                            editingScopeId ===
                            scope.id
                          }
                          onClose={() =>
                            setEditingScopeId(
                              null,
                            )
                          }
                          title="Edit business scope"
                          description={`${scope.company.name} · Update operational identity fields without changing the parent Company.`}
                          size="large"
                        >
                          <form
                            className="scopeEditForm"
                            onSubmit={(
                              event,
                            ) =>
                              void updateScope(
                                event,
                                scope.id,
                              )
                            }
                          >
                            <label>
                              Scope type

                              <select
                                name="type"
                                defaultValue={
                                  scope.type
                                }
                              >
                                <option value="RESTAURANT">
                                  Restaurant
                                </option>

                                <option value="PROPERTY_DEVELOPMENT">
                                  Property
                                  development
                                </option>

                                <option value="CONSTRUCTION">
                                  Construction
                                </option>

                                <option value="EVENT">
                                  Event
                                </option>
                              </select>
                            </label>

                            <label>
                              Scope name

                              <input
                                name="name"
                                defaultValue={
                                  scope.name
                                }
                                required
                              />
                            </label>

                            <label>
                              External
                              identifier

                              <input
                                name="externalIdentifier"
                                defaultValue={
                                  scope.externalIdentifier ??
                                  ''
                                }
                              />
                            </label>

                            <label>
                              Location

                              <input
                                name="location"
                                defaultValue={
                                  scope.location ??
                                  ''
                                }
                              />
                            </label>

                            <label>
                              Responsible
                              person

                              <input
                                name="responsiblePerson"
                                defaultValue={
                                  scope.responsiblePerson ??
                                  ''
                                }
                              />
                            </label>

                            <label>
                              Sector
                              counterpart

                              <input
                                name="sectorCounterpart"
                                defaultValue={
                                  scope.sectorCounterpart ??
                                  ''
                                }
                              />
                            </label>

                            <DialogActions>
                              <button
                                type="button"
                                className="secondaryAction"
                                onClick={() =>
                                  setEditingScopeId(
                                    null,
                                  )
                                }
                              >
                                Cancel
                              </button>

                              <button>
                                Save business
                                scope
                              </button>
                            </DialogActions>
                          </form>
                        </Dialog>
                      </article>
                    ),
                  )
                )}
              </div>
            </section>
          </div>
        )}
      </section>

      {/* Add Company */}

      <Dialog
        open={companyDialogOpen}
        onClose={() =>
          setCompanyDialogOpen(false)
        }
        title="Add company"
        description="Create a new Company inside the current Organization."
        size="small"
      >
        <form onSubmit={createCompany}>
          <label>
            Company name

            <input
              name="name"
              placeholder="Atlas Hospitality"
              autoFocus
              required
            />
          </label>

          <DialogActions>
            <button
              className="secondaryAction"
              type="button"
              onClick={() =>
                setCompanyDialogOpen(
                  false,
                )
              }
            >
              Cancel
            </button>

            <button>
              Create company
            </button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Add Business Scope */}

      <Dialog
        open={scopeDialogOpen}
        onClose={() => {
          setScopeDialogError('');
          setScopeDraft(null);
          setScopeDialogOpen(false);
        }}
        title={
          scopeDraft
            ? 'Review business scope'
            : 'Add business scope'
        }
        description={
          scopeDraft
            ? 'Verify the Company and operational identity before creation.'
            : 'Define a new operational scope under an active Company.'
        }
        size="large"
      >
        {!scopeDraft ? (
          <form
            ref={scopeForm}
            className="scopeEditForm"
            onSubmit={reviewScope}
          >
            <label>
              Company

              <select
                name="companyId"
                required
              >
                <option value="">
                  Select an active
                  Company
                </option>

                {activeCompanies.map(
                  (company) => (
                    <option
                      key={
                        company.id
                      }
                      value={
                        company.id
                      }
                    >
                      {company.name}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              Scope type

              <select
                name="type"
                required
              >
                <option value="RESTAURANT">
                  Restaurant
                </option>

                <option value="PROPERTY_DEVELOPMENT">
                  Property development
                </option>

                <option value="CONSTRUCTION">
                  Construction
                </option>

                <option value="EVENT">
                  Event
                </option>
              </select>
            </label>

            <label>
              Scope name

              <input
                name="name"
                placeholder="Atlas Restaurant"
                required
              />
            </label>

            <label>
              External identifier

              <input
                name="externalIdentifier"
                placeholder="Optional"
              />
            </label>

            <label>
              Location

              <input
                name="location"
                placeholder="Optional"
              />
            </label>

            <label>
              Responsible person

              <input
                name="responsiblePerson"
                placeholder="Optional"
              />
            </label>

            <label>
              Sector counterpart

              <input
                name="sectorCounterpart"
                placeholder="Optional"
              />
            </label>

            {scopeDialogError && (
              <Feedback tone="danger">
                {scopeDialogError}
              </Feedback>
            )}

            <DialogActions>
              <button
                className="secondaryAction"
                type="button"
                onClick={() => {
                  setScopeDialogError('');
                  setScopeDraft(null);
                  setScopeDialogOpen(false);
                }}
              >
                Cancel
              </button>

              <button>
                Review scope
              </button>
            </DialogActions>
          </form>
        ) : (
          <div className="scopeReview">
            <dl className="portfolioV2Meta">
              <div>
                <dt>Company</dt>
                <dd>
                  {
                    scopeDraft.companyName
                  }
                </dd>
              </div>

              <div>
                <dt>Type</dt>
                <dd>
                  {scopeDraft.type.replaceAll(
                    '_',
                    ' ',
                  )}
                </dd>
              </div>

              <div>
                <dt>Name</dt>
                <dd>
                  {scopeDraft.name}
                </dd>
              </div>

              {scopeDraft.externalIdentifier && (
                <div>
                  <dt>
                    External identifier
                  </dt>
                  <dd>
                    {
                      scopeDraft.externalIdentifier
                    }
                  </dd>
                </div>
              )}

              {scopeDraft.location && (
                <div>
                  <dt>Location</dt>
                  <dd>
                    {
                      scopeDraft.location
                    }
                  </dd>
                </div>
              )}
            </dl>

            <DialogActions>
              <button
                className="secondaryAction"
                type="button"
                onClick={() =>
                  setScopeDraft(null)
                }
              >
                Back
              </button>

              <button
                type="button"
                onClick={() =>
                  void confirmScope()
                }
              >
                Create business scope
              </button>
            </DialogActions>
          </div>
        )}
      </Dialog>

      {/* Lifecycle */}

      <Dialog
        open={
          lifecycleTarget !== null
        }
        onClose={() =>
          setLifecycleTarget(null)
        }
        title={
          lifecycleTarget?.status ===
            'ACTIVE'
            ? `Deactivate ${lifecycleTarget?.kind === 'company' ? 'company' : 'business scope'}`
            : `Reactivate ${lifecycleTarget?.kind === 'company' ? 'company' : 'business scope'}`
        }
        description={
          lifecycleTarget
            ? `${lifecycleTarget.name} · This lifecycle change takes effect immediately.`
            : ''
        }
        size="small"
      >
        <form
          onSubmit={changeLifecycle}
        >
          <label>
            Reason

            <textarea
              name="reason"
              placeholder="Why is this lifecycle change needed?"
              required
            />
          </label>

          <CheckboxRow
            name="confirmed"
            title="I understand this change takes effect immediately"
            description={
              lifecycleTarget?.kind === 'company' &&
                lifecycleTarget.status === 'ACTIVE'
                ? 'A Company cannot be deactivated while active Business Scopes still depend on it.'
                : 'The server will validate the lifecycle transition before applying it.'
            }
            required
          />

          {lifecycleError && (
            <Feedback tone="danger">
              {lifecycleError}
            </Feedback>
          )}

          <DialogActions>
            <button
              className="secondaryAction"
              type="button"
              onClick={() => {
                setLifecycleError('');
                setLifecycleTarget(null);
              }}
            >
              Cancel
            </button>

            <button>
              {lifecycleTarget?.status === 'ACTIVE'
                ? 'Deactivate'
                : 'Reactivate'}
            </button>
          </DialogActions>
        </form>
      </Dialog>
    </AppShell>
  );
}

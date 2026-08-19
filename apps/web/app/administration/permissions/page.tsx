'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import '../../styles.css';
import { AppShell, CheckboxRow, Dialog, DialogActions, Feedback, PageHeader, SearchableChecklist, tenantNav } from '../../components/ui';

function csrf(): string | undefined {
  return document.cookie.split('; ').find((part) => part.startsWith('nova_csrf='))?.split('=')[1];
}

type Preset = { id: string; key: string; label: string; version: number; capabilities: string[] };
type Collaborator = { id: string; version: number; profile: 'Administrator' | 'User'; status: string; identity: { email: string }; ownership: { id: string } | null; capabilityGrants: { capability: string }[]; companyGrants: { companyId: string }[]; businessScopeGrants: { businessScopeId: string }[]; organizationWideAccess: boolean };
type Company = { id: string; name: string; status: string };
type Scope = { id: string; name: string; status: string; company: { name: string } };
type AccessPreview = { email: string; before: { capabilities: string[]; companies: string[]; scopes: string[]; organization: boolean }; after: { capabilities: string[]; companies: string[]; scopes: string[]; organization: boolean } };

const capabilityLabels: Record<string, string> = {
  'companies.read': 'View companies',
  'business_scopes.read': 'View business scopes',
};

export default function PermissionsPage() {
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'danger'>('success');
  const [loading, setLoading] = useState(true);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [preview, setPreview] = useState<AccessPreview | null>(null);
  const [selectedCollaboratorId, setSelectedCollaboratorId] = useState('');
  const [organizationWide, setOrganizationWide] = useState(false);
  const [presetEditorOpen, setPresetEditorOpen] = useState(false);

  const activeCollaborators = useMemo(() => collaborators.filter((item) => item.status === 'ACTIVE' && !item.ownership), [collaborators]);
  const activeCompanies = useMemo(() => companies.filter((item) => item.status === 'ACTIVE'), [companies]);
  const activeScopes = useMemo(() => scopes.filter((item) => item.status === 'ACTIVE'), [scopes]);
  const selectedCollaborator = collaborators.find((item) => item.id === selectedCollaboratorId);

  function loadPresets() {
    return fetch('/api/permission-presets', { credentials: 'include' }).then(async (response) => {
      if (!response.ok) throw new Error('Could not load access templates.');
      setPresets((await response.json()) as Preset[]);
    });
  }
  function loadCollaborators() {
    return fetch('/api/collaborators', { credentials: 'include' }).then(async (response) => {
      if (!response.ok) throw new Error('Could not load collaborators.');
      setCollaborators((await response.json()) as Collaborator[]);
    });
  }
  useEffect(() => {
    void Promise.all([
      loadPresets(), loadCollaborators(),
      fetch('/api/organizations/companies', { credentials: 'include' }).then(async (response) => { if (!response.ok) throw new Error(); setCompanies((await response.json()) as Company[]); }),
      fetch('/api/organizations/business-scopes', { credentials: 'include' }).then(async (response) => { if (!response.ok) throw new Error(); setScopes((await response.json()) as Scope[]); }),
    ]).catch(() => { setMessageTone('danger'); setMessage('Some access information could not be loaded. Refresh the page to try again.'); }).finally(() => setLoading(false));
  }, []);

  function updatePreview(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    const collaborator = collaborators.find((item) => item.id === String(form.get('membershipId')));
    setOrganizationWide(form.get('organizationWideAccess') === 'on');
    if (!collaborator) { setPreview(null); return; }
    setPreview({
      email: collaborator.identity.email,
      before: { capabilities: collaborator.capabilityGrants.map((item) => item.capability), companies: collaborator.companyGrants.map((item) => item.companyId), scopes: collaborator.businessScopeGrants.map((item) => item.businessScopeId), organization: collaborator.organizationWideAccess },
      after: { capabilities: form.getAll('capabilities').map(String), companies: form.getAll('companyIds').map(String), scopes: form.getAll('businessScopeIds').map(String), organization: form.get('organizationWideAccess') === 'on' },
    });
  }
  function applyPreset(event: ChangeEvent<HTMLSelectElement>) {
    const selected = new Set(presets.find((item) => item.id === event.currentTarget.value)?.capabilities ?? []);
    event.currentTarget.form?.querySelectorAll<HTMLInputElement>('input[name="capabilities"]').forEach((item) => { item.checked = selected.has(item.value); });
  }
  function applyCollaborator(event: ChangeEvent<HTMLSelectElement>) {
    event.stopPropagation();
    const collaborator = collaborators.find((item) => item.id === event.currentTarget.value);
    setSelectedCollaboratorId(event.currentTarget.value);
    setOrganizationWide(collaborator?.organizationWideAccess ?? false);
    if (!collaborator) { setPreview(null); return; }
    const current = { capabilities: collaborator.capabilityGrants.map((item) => item.capability), companies: collaborator.companyGrants.map((item) => item.companyId), scopes: collaborator.businessScopeGrants.map((item) => item.businessScopeId), organization: collaborator.organizationWideAccess };
    setPreview({ email: collaborator.identity.email, before: current, after: current });
  }

  async function createPreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const token = csrf();
    const response = await fetch('/api/permission-presets', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) }, body: JSON.stringify({ key: form.get('key'), label: form.get('label'), capabilities: form.getAll('presetCapabilities').map(String), reason: form.get('presetReason'), confirmed: form.get('presetConfirmed') === 'on' }) });
    if (response.ok) {
      formElement.reset(); await loadPresets(); setPresetEditorOpen(false); setMessageTone('success'); setMessage('Access template created. It is now available as a starting point.');
    } else { setMessageTone('danger'); setMessage('Template creation failed. Review the key, access choices, and confirmation.'); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get('membershipId'));
    const collaborator = collaborators.find((item) => item.id === id);
    if (!collaborator) { setMessageTone('danger'); setMessage('Select an active collaborator before saving.'); return; }
    const token = csrf();
    const presetId = String(form.get('presetId') ?? '');
    const response = await fetch(`/api/collaborators/${id}/grants`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) }, body: JSON.stringify({ capabilities: form.getAll('capabilities').map(String), companyIds: form.getAll('companyIds').map(String), businessScopeIds: form.getAll('businessScopeIds').map(String), organizationWideAccess: form.get('organizationWideAccess') === 'on', expectedVersion: collaborator.version, reason: form.get('reason'), confirmed: form.get('confirmed') === 'on', ...(presetId ? { presetId } : {}) }) });
    if (response.ok) { setMessageTone('success'); setMessage('Access updated. The collaborator must sign in again to use the new access.'); await loadCollaborators(); }
    else {
      const problem = (await response.json().catch(() => null)) as { detail?: string; message?: string; correlationId?: string } | null;
      const detail = problem?.detail ?? problem?.message ?? 'Access update failed.';
      setMessageTone('danger'); setMessage(`${detail}${problem?.correlationId ? ` Reference: ${problem.correlationId}` : ''}`);
    }
  }

  const removesAccess = preview && ((preview.before.organization && !preview.after.organization) || preview.before.capabilities.some((item) => !preview.after.capabilities.includes(item)) || preview.before.companies.some((item) => !preview.after.companies.includes(item)) || preview.before.scopes.some((item) => !preview.after.scopes.includes(item)));

  return <AppShell area="Organization administration" active="/administration/permissions" items={tenantNav} footer="Effective access is resolved securely by the server" requiredAccess="organization-administrator">
    <PageHeader eyebrow="Users & access" title="Collaborator access" description="Choose a person, set what they can see, and review the change before it takes effect." />
    <section className="permissionsPage">
      <div className="permissionStats" aria-label="Access overview">
        <article><span>Active collaborators</span><strong>{activeCollaborators.length}</strong><small>People you can configure</small></article>
        <article><span>Access templates</span><strong>{presets.length}</strong><small>Reusable starting points</small></article>
        <article><span>Available assignments</span><strong>{activeCompanies.length}</strong><small>Companies · {activeScopes.length} business scopes</small></article>
      </div>
      {message && <Feedback tone={messageTone}>{message}</Feedback>}
      <article className="accessTemplateBar">
        <div><span className="sectionEyebrow">Access templates</span><h2>Reusable starting points</h2><p>Templates speed up common access setups. Choosing one never changes a collaborator until you review and save.</p></div>
        <div className="templateSummary" aria-label="Available access templates">{loading ? <span className="mutedState">Loading templates…</span> : presets.length === 0 ? <span className="mutedState">No templates yet</span> : presets.slice(0, 5).map((preset) => <span className="templateChip" key={preset.id}>{preset.label}<b>v{preset.version}</b></span>)}</div>
        <button className="secondaryAction" type="button" onClick={() => setPresetEditorOpen(true)}>Create template</button>
      </article>
      <article className="accessWorkflow accessWorkflowRedesigned">
        {loading ? (
          <div className="permissionLoading" role="status">
            Loading collaborators and assignments…
          </div>
        ) : activeCollaborators.length === 0 ? (
          <div className="permissionEmpty">
            <strong>No active collaborators to configure</strong>
            <span>Invite a collaborator or activate an existing account first.</span>
          </div>
        ) : (
          <form
            className="accessWorkflowForm accessWorkflowFormRedesigned"
            onSubmit={submit}
            onChange={updatePreview}
          >
            <section className="permissionBlock permissionBlockIntro">
              <div className="permissionBlockHeader">
                <div>
                  <span className="sectionEyebrow">Collaborator</span>
                  <h2>Choose who you want to configure</h2>
                  <p>
                    Existing access is loaded automatically. Nothing changes until
                    you review and save.
                  </p>
                </div>
              </div>

              <div className="accessIdentityFields">
                <label>
                  Collaborator
                  <select
                    name="membershipId"
                    onChange={applyCollaborator}
                    required
                  >
                    <option value="">Choose an active collaborator</option>
                    {activeCollaborators.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.identity.email} · {item.profile}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Start from a template
                  <span className="optionalLabel">Optional</span>
                  <select
                    name="presetId"
                    onChange={applyPreset}
                    disabled={!selectedCollaboratorId}
                  >
                    <option value="">Keep current access</option>
                    {presets.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} · version {item.version}
                      </option>
                    ))}
                  </select>
                  <small className="helperText">
                    Templates are only a starting point. You can adjust everything
                    below before saving.
                  </small>
                </label>
              </div>
            </section>

            {selectedCollaboratorId && (
              <>
                <section className="permissionBlock">
                  <div className="permissionBlockHeader">
                    <div>
                      <span className="sectionEyebrow">Viewing permissions</span>
                      <h2>What can they see?</h2>
                      <p>Select the product areas this collaborator needs.</p>
                    </div>
                  </div>

                  <div className="capabilityCards capabilityCardsWide">
                    <CheckboxRow
                      name="capabilities"
                      value="companies.read"
                      title="Companies"
                      description="View company records and their current status."
                      defaultChecked={Boolean(
                        selectedCollaborator?.capabilityGrants.some(
                          (item) => item.capability === 'companies.read',
                        ),
                      )}
                    />

                    <CheckboxRow
                      name="capabilities"
                      value="business_scopes.read"
                      title="Business scopes"
                      description="View the operational scopes assigned below."
                      defaultChecked={Boolean(
                        selectedCollaborator?.capabilityGrants.some(
                          (item) => item.capability === 'business_scopes.read',
                        ),
                      )}
                    />
                  </div>
                </section>

                <section className="permissionBlock">
                  <div className="permissionBlockHeader permissionBlockHeaderRow">
                    <div>
                      <span className="sectionEyebrow">Access coverage</span>
                      <h2>Where does access apply?</h2>
                      <p>
                        Give broad organization access or choose specific companies
                        and business scopes.
                      </p>
                    </div>
                  </div>

                  <div className="organizationAccessCard organizationAccessCardWide">
                    <CheckboxRow
                      name="organizationWideAccess"
                      title="Entire organization"
                      description="Includes all current and future active companies and business scopes."
                      defaultChecked={Boolean(
                        selectedCollaborator?.organizationWideAccess,
                      )}
                    />
                    <em>Broadest access</em>
                  </div>

                  {!organizationWide ? (
                    <div className="specificAssignmentPanel">
                      <div className="assignmentToolbar">
                        <div>
                          <strong>Specific assignments</strong>
                          <span>
                            Search and select only the companies and scopes this
                            collaborator should be able to access.
                          </span>
                        </div>
                      </div>

                      <div
                        className="assignmentColumns assignmentColumnsWide"
                        key={selectedCollaboratorId}
                      >
                        <SearchableChecklist
                          legend="Companies"
                          name="companyIds"
                          searchPlaceholder="Search companies…"
                          emptyText="No active companies available."
                          defaultSelected={
                            selectedCollaborator?.companyGrants.map(
                              (item) => item.companyId,
                            ) ?? []
                          }
                          items={activeCompanies.map((item) => ({
                            id: item.id,
                            label: item.name,
                          }))}
                        />

                        <SearchableChecklist
                          legend="Business scopes"
                          name="businessScopeIds"
                          searchPlaceholder="Search business scopes…"
                          emptyText="No active business scopes available."
                          defaultSelected={
                            selectedCollaborator?.businessScopeGrants.map(
                              (item) => item.businessScopeId,
                            ) ?? []
                          }
                          items={activeScopes.map((item) => ({
                            id: item.id,
                            label: item.name,
                            description: item.company.name,
                          }))}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="organizationWideNotice">
                      <strong>Organization-wide access selected</strong>
                      <span>
                        Specific assignment controls are hidden because broad access
                        already includes every active company and business scope.
                      </span>
                    </div>
                  )}
                </section>

                <section className="permissionBlock permissionReviewBlock">
                  <div className="permissionBlockHeader">
                    <div>
                      <span className="sectionEyebrow">Review</span>
                      <h2>Review and save</h2>
                      <p>
                        Check the resulting access before applying the change.
                      </p>
                    </div>
                  </div>

                  {preview && (
                    <aside className="accessPreview" aria-label="Access change preview">
                      <header>
                        <span>Access change</span>
                        <strong>{preview.email}</strong>
                      </header>

                      <div className="previewGrid">
                        <span>
                          <small>Viewing permissions</small>
                          <strong>
                            {preview.after.capabilities
                              .map((item) => capabilityLabels[item] ?? item)
                              .join(', ') || 'None selected'}
                          </strong>
                        </span>

                        <span>
                          <small>Coverage</small>
                          <strong>
                            {preview.after.organization
                              ? 'Entire organization'
                              : `${preview.after.companies.length} companies · ${preview.after.scopes.length} scopes`}
                          </strong>
                        </span>
                      </div>

                      {removesAccess && (
                        <div className="reductionWarning">
                          <strong>This removes existing access.</strong>{' '}
                          Review the selections carefully before saving.
                        </div>
                      )}
                    </aside>
                  )}

                  <div className="permissionReview permissionReviewRedesigned">
                    <label>
                      Reason for change
                      <input
                        name="reason"
                        required
                        placeholder="For example: role changed to regional analyst"
                      />
                    </label>

                    <CheckboxRow
                      name="confirmed"
                      title="I have reviewed this access change"
                      description="The new access takes effect immediately and may require the collaborator to sign in again."
                      required
                    />

                    <div className="permissionSaveActions">
                      <button type="submit">Save collaborator access</button>
                    </div>
                  </div>
                </section>
              </>
            )}
          </form>
        )}
      </article>
    </section>
    <Dialog open={presetEditorOpen} onClose={() => setPresetEditorOpen(false)} title="Create a reusable template" description="Save a new versioned starting point. Existing collaborator access will not change." size="large"><form className="presetModalForm" onSubmit={createPreset}><div className="presetIdentityFields"><label>Template key<input name="key" placeholder="READ_ONLY" required /><small className="helperText">A stable internal identifier, such as REGIONAL_VIEWER.</small></label><label>Template name<input name="label" placeholder="Regional viewer" maxLength={100} required /></label></div><fieldset><legend>What should this template allow?</legend><div className="capabilityCards"><CheckboxRow name="presetCapabilities" value="companies.read" title="View companies" description="See company records and status." /><CheckboxRow name="presetCapabilities" value="business_scopes.read" title="View business scopes" description="See assigned operational scopes." /></div></fieldset><label>Reason for creating this version<input name="presetReason" placeholder="Why is this template needed?" required /></label><CheckboxRow name="presetConfirmed" title="Create a new immutable version" description="Existing collaborator assignments will not change." required /><DialogActions><button className="secondaryAction" type="button" onClick={() => setPresetEditorOpen(false)}>Cancel</button><button>Create template version</button></DialogActions></form></Dialog>
  </AppShell>;
}

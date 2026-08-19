'use client';
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import '../../styles.css';
import {
  AppShell,
  CheckboxRow,
  Dialog,
  DialogActions,
  PageHeader,
  SearchableChecklist,
  tenantNav,
} from '../../components/ui';
function csrf(): string | undefined {
  return document.cookie
    .split('; ')
    .find((part) => part.startsWith('nova_csrf='))
    ?.split('=')[1];
}
async function mutation(path: string, body?: object) {
  const token = csrf();
  return fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function failureMessage(response: Response, fallback: string) {
  const problem = (await response.json().catch(() => null)) as {
    detail?: string;
    message?: string;
    correlationId?: string;
  } | null;
  const detail = problem?.detail ?? problem?.message ?? fallback;
  return `${detail}${problem?.correlationId ? ` Reference: ${problem.correlationId}` : ''}`;
}
type Invitation = {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  capabilities: string[];
  companyIds: string[];
  businessScopeIds: string[];
  organizationWideAccess: boolean;
  status: 'PENDING' | 'EXPIRED' | 'REVOKED' | 'ACCEPTED';
};
type Preset = { id: string; key: string; label: string; version: number; capabilities: string[] };
type Company = { id: string; name: string; status: string };
type Scope = { id: string; name: string; status: string; company: { name: string } };
type Collaborator = {
  id: string;
  profile: 'Administrator' | 'User';
  status: string;
  identity: { email: string };
  ownership: { id: string } | null;
};
export default function CollaboratorsPage() {
  const [activeDialog, setActiveDialog] = useState<'invite' | 'access' | 'invitation' | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [selectedMembershipId, setSelectedMembershipId] = useState('');
  const [lifecycleAction, setLifecycleAction] = useState('');
  const refreshDirectory = useCallback(async () => {
    try {
      const [
        invitationResponse,
        collaboratorResponse,
        presetResponse,
        companyResponse,
        scopeResponse,
      ] = await Promise.all([
        fetch('/api/invitations/collaborator', { credentials: 'include' }),
        fetch('/api/collaborators', { credentials: 'include' }),
        fetch('/api/permission-presets', { credentials: 'include' }),
        fetch('/api/organizations/companies', { credentials: 'include' }),
        fetch('/api/organizations/business-scopes', { credentials: 'include' }),
      ]);
      if (invitationResponse.ok) setInvitations((await invitationResponse.json()) as Invitation[]);
      if (collaboratorResponse.ok)
        setCollaborators((await collaboratorResponse.json()) as Collaborator[]);
      if (presetResponse.ok) setPresets((await presetResponse.json()) as Preset[]);
      if (companyResponse.ok) setCompanies((await companyResponse.json()) as Company[]);
      if (scopeResponse.ok) setScopes((await scopeResponse.json()) as Scope[]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refreshDirectory();
  }, [refreshDirectory]);
  function applyInvitationPreset(event: ChangeEvent<HTMLSelectElement>) {
    const preset = presets.find((candidate) => candidate.id === event.currentTarget.value);
    const selected = new Set(preset?.capabilities ?? []);
    event.currentTarget.form
      ?.querySelectorAll<HTMLInputElement>('input[name="inviteCapabilities"]')
      .forEach((checkbox) => {
        checkbox.checked = selected.has(checkbox.value);
      });
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await mutation('/invitations/collaborator', {
      email: form.get('email'),
      presetId: form.get('presetId') || undefined,
      capabilities: form.getAll('inviteCapabilities'),
      companyIds: form.getAll('inviteCompanyIds'),
      businessScopeIds: form.getAll('inviteBusinessScopeIds'),
      organizationWideAccess: form.get('inviteOrganizationWideAccess') === 'on',
    });
    setMessage(
      response.ok
        ? 'Invitation created and queued for delivery.'
        : await failureMessage(response, 'Invitation failed.'),
    );
    if (response.ok) {
      formElement.reset();
      await refreshDirectory();
      setActiveDialog(null);
    }
  }
  async function invitationLifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const invitationId = String(form.get('invitationId'));
    const action = String(form.get('invitationAction'));
    const response = await mutation(`/invitations/collaborator/${invitationId}/${action}`, {
      reason: form.get('invitationReason'),
      confirmed: form.get('invitationConfirmed') === 'on',
    });
    setMessage(
      response.ok
        ? action === 'resend'
          ? 'Previous link revoked and a replacement invitation queued.'
          : 'Invitation revoked immediately.'
        : await failureMessage(
          response,
          `Could not ${action} invitation. It may no longer be pending.`,
        ),
    );
    if (response.ok) {
      await refreshDirectory();
      setActiveDialog(null);
    }
  }
  async function lifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get('membershipId'));
    const action = String(form.get('action'));
    const token = csrf();
    const path =
      action === 'demote' ? `/api/ownership/demote/${id}` : `/api/collaborators/${id}/${action}`;
    const response = await fetch(path, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
      body: JSON.stringify({
        reason: form.get('reason'),
        confirmed: form.get('confirmed') === 'on',
      }),
    });
    const successMessage: Record<string, string> = {
      suspend: 'Collaborator access suspended.',
      reactivate: 'Collaborator access reactivated.',
      remove: 'Collaborator access removed.',
      demote: 'Administrator changed to User. Their existing sessions were revoked.',
    };
    setMessage(
      response.ok
        ? (successMessage[action] ?? 'Collaborator updated.')
        : await failureMessage(
          response,
          action === 'demote'
            ? 'Demotion failed. Select an active non-owner Administrator and confirm as the owner.'
            : `Could not ${action} collaborator. A reason and confirmation are required.`,
        ),
    );
    if (response.ok) {
      await refreshDirectory();
      setActiveDialog(null);
    }
  }
  const activeCollaborators = collaborators.filter(
    (collaborator) => collaborator.status === 'ACTIVE',
  ).length;
  const administrators = collaborators.filter(
    (collaborator) => collaborator.profile === 'Administrator',
  ).length;
  const pending = invitations.filter((invitation) => invitation.status === 'PENDING');
  const actionableInvitations = invitations.filter(
    (invitation) => invitation.status === 'PENDING' || invitation.status === 'EXPIRED',
  );
  const selectedCollaborator = collaborators.find(
    (collaborator) => collaborator.id === selectedMembershipId,
  );
  const lifecycleActions = selectedCollaborator
    ? selectedCollaborator.status === 'ACTIVE'
      ? [
        { value: 'suspend', label: 'Suspend access' },
        ...(selectedCollaborator.profile === 'Administrator'
          ? [{ value: 'demote', label: 'Change Administrator to User' }]
          : []),
        { value: 'remove', label: 'Remove access' },
      ]
      : selectedCollaborator.status === 'SUSPENDED'
        ? [
          { value: 'reactivate', label: 'Reactivate access' },
          { value: 'remove', label: 'Remove access' },
        ]
        : []
    : [];
  return (
    <AppShell
      area="Organization administration"
      active="/administration/collaborators"
      items={tenantNav}
      footer="Profiles: Administrator or User"
      requiredAccess="organization-administrator"
    >
      <div className="collaboratorsPage">
        <PageHeader
          eyebrow="Access management"
          title="Collaborators"
          description="Invite people and manage access without deleting account history."
          actions={<><button type="button" onClick={() => setActiveDialog('invite')}>+ Invite collaborator</button><button className="secondaryAction" type="button" onClick={() => setActiveDialog('access')}>Change access</button><a className="button buttonSecondary" href="/administration/permissions">Manage permissions</a></>}
        />

        {message && (
          <div className="collaboratorNotice" role="status">
            {message}
            <button type="button" aria-label="Dismiss message" onClick={() => setMessage('')}>
              ×
            </button>
          </div>
        )}

        <section className="collaboratorStats" aria-label="Collaborator summary">
          <article>
            <span>Total collaborators</span>
            <strong>{loading ? '—' : collaborators.length}</strong>
          </article>
          <article>
            <span>Active access</span>
            <strong>{loading ? '—' : activeCollaborators}</strong>
          </article>
          <article>
            <span>Administrators</span>
            <strong>{loading ? '—' : administrators}</strong>
          </article>
          <article>
            <span>Pending invitations</span>
            <strong>{loading ? '—' : pending.length}</strong>
          </article>
        </section>

        <Dialog open={activeDialog === 'invite'} onClose={() => setActiveDialog(null)} title="Invite a collaborator" description="Create a focused invitation and assign only the access this person needs." size="large">
          <form className="collaboratorCard inviteCard" onSubmit={invite}>
            <label>
              Work email
              <input name="email" type="email" required placeholder="name@example.com" />
            </label>
            <label>
              Starting preset
              <select name="presetId" onChange={applyInvitationPreset}>
                <option value="">Custom explicit access</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} v{preset.version}
                  </option>
                ))}
              </select>
              <small className="helperText">
                Selecting a version fills the capabilities below. Adjust them before sending; the
                invitation stores only the final explicit grants.
              </small>
            </label>
            <div className="inviteCapabilityGrid"><CheckboxRow name="inviteCapabilities" value="companies.read" title="View companies" description="See assigned company records and status." /><CheckboxRow name="inviteCapabilities" value="business_scopes.read" title="View business scopes" description="See assigned operational scopes." /></div>
            <CheckboxRow name="inviteOrganizationWideAccess" title="Access the entire organization" description="Includes every current and future active company and business scope." />
            <div className="inviteSelectorGrid"><SearchableChecklist legend="Company access" name="inviteCompanyIds" searchPlaceholder="Search companies…" emptyText="No active companies available." items={companies.filter((item) => item.status === 'ACTIVE').map((item) => ({ id: item.id, label: item.name }))} /><SearchableChecklist legend="Business scope access" name="inviteBusinessScopeIds" searchPlaceholder="Search business scopes…" emptyText="No active business scopes available." items={scopes.filter((item) => item.status === 'ACTIVE').map((item) => ({ id: item.id, label: item.name, description: item.company.name }))} /></div>
            <DialogActions><button className="secondaryAction" type="button" onClick={() => setActiveDialog(null)}>Cancel</button><button className="primaryButton">Send invitation</button></DialogActions>
          </form>
        </Dialog>
        <Dialog open={activeDialog === 'access'} onClose={() => setActiveDialog(null)} title="Change collaborator access" description="Suspend, restore, remove, or change the profile of one non-owner collaborator.">
          <form className="collaboratorCard" onSubmit={lifecycle}>
            <div className="formGrid">
              <label className="fullField">
                Collaborator
                <select
                  name="membershipId"
                  value={selectedMembershipId}
                  onChange={(event) => {
                    const id = event.target.value;
                    setSelectedMembershipId(id);
                    const collaborator = collaborators.find((candidate) => candidate.id === id);
                    setLifecycleAction(
                      collaborator?.status === 'ACTIVE'
                        ? 'suspend'
                        : collaborator?.status === 'SUSPENDED'
                          ? 'reactivate'
                          : '',
                    );
                  }}
                  required
                >
                  <option value="">Select a collaborator</option>
                  {collaborators
                    .filter((collaborator) => !collaborator.ownership)
                    .map((collaborator) => (
                      <option key={collaborator.id} value={collaborator.id}>
                        {collaborator.identity.email} · {collaborator.profile} ·{' '}
                        {collaborator.status}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Action
                <select
                  name="action"
                  value={lifecycleAction}
                  onChange={(event) => setLifecycleAction(event.target.value)}
                  disabled={!lifecycleActions.length}
                  required
                >
                  {!lifecycleActions.length && <option value="">No direct action available</option>}
                  {lifecycleActions.map((action) => (
                    <option key={action.value} value={action.value}>
                      {action.label}
                    </option>
                  ))}
                </select>
                {selectedCollaborator?.status === 'REMOVED' && (
                  <small className="helperText">
                    Removed access is historical. Invite this email again to restore it safely.
                  </small>
                )}
              </label>
              <label>
                Reason
                <input name="reason" required placeholder="Why is this change needed?" />
              </label>
            </div>
            <CheckboxRow name="confirmed" title="Apply this change immediately" description="The collaborator's current access and active sessions may be affected." required />
            <DialogActions><button className="secondaryAction" type="button" onClick={() => setActiveDialog(null)}>Cancel</button><button className="dangerButton" disabled={!lifecycleActions.length}>Review and confirm</button></DialogActions>
          </form>
        </Dialog>

        <section className="directorySection collaboratorDirectorySection">
          <div className="sectionHeading">
            <div>
              <p>DIRECTORY</p>
              <h2>Current collaborators</h2>
            </div>

            <span>{collaborators.length} accounts</span>
          </div>

          <div className="collaboratorDirectoryList">
            {loading ? (
              <div className="collaboratorDirectoryEmpty">
                Loading collaborators…
              </div>
            ) : collaborators.length ? (
              collaborators.map((collaborator) => {
                const initials = collaborator.identity.email
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <article
                    className="collaboratorDirectoryRow"
                    key={collaborator.id}
                  >
                    <span className="avatar">
                      {initials}
                    </span>

                    <div className="collaboratorDirectoryIdentity">
                      <strong>
                        {collaborator.identity.email}
                      </strong>

                      <span>
                        {collaborator.profile}
                        {collaborator.ownership
                          ? ' · Organization owner'
                          : ''}
                      </span>
                    </div>

                    <div className="collaboratorDirectoryBadges">
                      {collaborator.ownership && (
                        <span className="ownerBadge">
                          Owner
                        </span>
                      )}

                      <b
                        className={`statusBadge ${collaborator.status === 'ACTIVE'
                          ? 'statusActive'
                          : 'statusInactive'
                          }`}
                      >
                        {collaborator.status}
                      </b>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="collaboratorDirectoryEmpty">
                <strong>No collaborators yet</strong>
                <span>
                  Invite someone to begin building the team.
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="directorySection collaboratorDirectorySection">
          <div className="sectionHeading">
            <div>
              <p>INVITATIONS</p>
              <h2>Invitation history</h2>
            </div>

            <div className="sectionHeadingActions">
              <span>
                {pending.length} awaiting response · {invitations.length} total
              </span>

              {actionableInvitations.length > 0 && (
                <button
                  className="secondaryAction collaboratorHeaderAction"
                  type="button"
                  onClick={() =>
                    setActiveDialog('invitation')
                  }
                >
                  Manage invitation
                </button>
              )}
            </div>
          </div>

          <div className="collaboratorDirectoryList invitationDirectoryList">
            {loading ? (
              <div className="collaboratorDirectoryEmpty">
                Loading invitations…
              </div>
            ) : invitations.length ? (
              invitations.map((invitation) => (
                <article
                  className="collaboratorDirectoryRow invitationDirectoryRow"
                  key={invitation.id}
                >
                  <span className="avatar invitationAvatar">
                    ✉
                  </span>

                  <div className="collaboratorDirectoryIdentity">
                    <strong>
                      {invitation.email}
                    </strong>

                    <span>
                      Sent{' '}
                      {new Date(
                        invitation.createdAt,
                      ).toLocaleDateString()}
                      {' · '}
                      expires{' '}
                      {new Date(
                        invitation.expiresAt,
                      ).toLocaleDateString()}
                    </span>

                    <div className="invitationAccessSummary">
                      <span>
                        {invitation.capabilities.length}{' '}
                        capabilities
                      </span>

                      <span>
                        {invitation.companyIds.length}{' '}
                        companies
                      </span>

                      <span>
                        {
                          invitation.businessScopeIds
                            .length
                        }{' '}
                        scopes
                      </span>

                      {invitation.organizationWideAccess && (
                        <span>
                          Entire organization
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="collaboratorDirectoryBadges">
                    <b
                      className={`statusBadge ${invitation.status === 'PENDING'
                          ? 'statusPending'
                          : invitation.status === 'ACCEPTED'
                            ? 'statusActive'
                            : 'statusInactive'
                        }`}
                    >
                      {invitation.status}
                    </b>
                  </div>
                </article>
              ))
            ) : (
              <div className="collaboratorDirectoryEmpty">
                <strong>No invitation history</strong>
                <span>
                  New invitations and their final
                  status will appear here.
                </span>
              </div>
            )}
          </div>

          <Dialog
            open={activeDialog === 'invitation'}
            onClose={() =>
              setActiveDialog(null)
            }
            title="Manage an invitation"
            description="Resend a secure replacement link or revoke a pending invitation."
          >
            <form
              className="invitationAction"
              onSubmit={invitationLifecycle}
            >
              <div className="formGrid invitationFormGrid">
                <label>
                  Invitation

                  <select
                    name="invitationId"
                    required
                  >
                    <option value="">
                      Select an invitation
                    </option>

                    {actionableInvitations.map(
                      (invitation) => (
                        <option
                          key={invitation.id}
                          value={invitation.id}
                        >
                          {invitation.email} ·{' '}
                          {invitation.status}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label>
                  Action

                  <select name="invitationAction">
                    <option value="resend">
                      Resend a new link
                    </option>

                    <option value="revoke">
                      Revoke a pending invitation
                    </option>
                  </select>
                </label>

                <label>
                  Reason

                  <input
                    name="invitationReason"
                    required
                    placeholder="Reason for this action"
                  />
                </label>
              </div>

              <CheckboxRow
                name="invitationConfirmed"
                title="Invalidate the previous invitation link"
                description="This action is immediate and will be recorded."
                required
              />

              <DialogActions>
                <button
                  className="secondaryAction"
                  type="button"
                  onClick={() =>
                    setActiveDialog(null)
                  }
                >
                  Cancel
                </button>

                <button>
                  Confirm invitation action
                </button>
              </DialogActions>
            </form>
          </Dialog>
        </section>
      </div>
    </AppShell>
  );
}

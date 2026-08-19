'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import '../../styles.css';
import { AppShell, CheckboxRow, Feedback, PageHeader, tenantNav } from '../../components/ui';
function csrf(): string | undefined {
  return document.cookie
    .split('; ')
    .find((part) => part.startsWith('nova_csrf='))
    ?.split('=')[1];
}
async function request(path: string, method: string, body?: object) {
  const token = csrf();
  return fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function failure(response: Response, fallback: string): Promise<string> {
  const problem = (await response.json().catch(() => null)) as {
    detail?: string;
    code?: string;
    correlationId?: string;
  } | null;
  if (!problem) return fallback;
  const reference = [problem.code, problem.correlationId].filter(Boolean).join(' · ');
  return `${problem.detail ?? fallback}${reference ? ` (${reference})` : ''}`;
}
type Collaborator = {
  id: string;
  profile: 'Administrator' | 'User';
  status: string;
  identity: { email: string };
  ownership: { id: string } | null;
};
type OwnershipProposal = {
  id: string;
  proposerMembershipId: string;
  proposerEmail: string;
  successorMembershipId: string;
  expiresAt: string;
};
export default function OwnershipPage() {
  const [activeTask, setActiveTask] = useState<'promote' | 'propose' | 'accept'>('promote');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [proposals, setProposals] = useState<OwnershipProposal[]>([]);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [collaboratorResponse, proposalResponse] = await Promise.all([
        fetch('/api/collaborators', { credentials: 'include' }),
        fetch('/api/ownership/transfers', { credentials: 'include' }),
      ]);
      if (!collaboratorResponse.ok || !proposalResponse.ok) throw new Error('Unavailable');
      setCollaborators((await collaboratorResponse.json()) as Collaborator[]);
      setProposals((await proposalResponse.json()) as OwnershipProposal[]);
    } catch {
      setMessage('Governance information could not be loaded. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function promote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const response = await request(`/ownership/promote/${form.get('membershipId')}`, 'PATCH', {
      reason: form.get('reason'),
      confirmed: form.get('confirmed') === 'on',
    });
    setMessage(
      response.ok
        ? 'User promoted to Administrator. Their existing sessions were revoked; they must sign in again.'
        : await failure(
            response,
            'Promotion failed. A fresh login, reason, and confirmation are required.',
          ),
    );
    if (response.ok) await refresh();
    setSubmitting(false);
  }
  async function propose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const response = await request('/ownership/transfers', 'POST', {
      successorMembershipId: form.get('membershipId'),
      reason: form.get('reason'),
      confirmed: form.get('confirmed') === 'on',
    });
    setMessage(
      response.ok
        ? 'Ownership transfer proposed.'
        : await failure(response, 'Transfer proposal failed. Review the required confirmation.'),
    );
    setSubmitting(false);
  }
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const proposalId = String(form.get('proposalId'));
    const response = await request(`/ownership/transfers/${proposalId}/accept`, 'POST', {
      reason: form.get('reason'),
      confirmed: form.get('confirmed') === 'on',
    });
    if (response.ok) {
      window.location.assign('/login?reason=ownership-transferred');
      return;
    }
    setMessage(await failure(response, 'Transfer acceptance failed. Review the proposal state.'));
    setSubmitting(false);
  }
  const confirmation = (
    <CheckboxRow
      name="confirmed"
      title="I understand this sensitive change"
      description="This action can change access immediately and may revoke active sessions."
      required
    />
  );
  return (
    <AppShell
      area="Organization administration"
      active="/administration/ownership"
      items={tenantNav}
      footer="One active owner at all times"
      requiredAccess="organization-administrator"
    >
      <PageHeader
        eyebrow="Sensitive governance"
        title="Ownership & promotion"
        description="Promote eligible Users and transfer ownership while preserving the one-owner and active-Administrator invariants."
      />
      <div className="feedback feedback-warning">
        <span aria-hidden="true">△</span>
        <div>
          <strong>Recent authentication required</strong>
          <br />
          Every action needs a reason and explicit confirmation. Ownership transfer completes only
          when the successor accepts. Promotion and accepted transfer revoke affected sessions.
        </div>
      </div>
      <section className="governanceWorkspace">
        <div className="governanceStats">
          <div className="governanceStat">
            <span>Active administrators</span>
            <strong>{collaborators.filter((item) => item.profile === 'Administrator' && item.status === 'ACTIVE').length}</strong>
            <small>Including the current owner</small>
          </div>
          <div className="governanceStat">
            <span>Eligible for promotion</span>
            <strong>{collaborators.filter((item) => item.profile === 'User' && item.status === 'ACTIVE').length}</strong>
            <small>Active users</small>
          </div>
          <div className="governanceStat">
            <span>Pending transfers</span>
            <strong>{proposals.length}</strong>
            <small>Addressed to your account</small>
          </div>
        </div>

        {message && (
          <Feedback
            tone={
              message.startsWith('User promoted') || message === 'Ownership transfer proposed.'
                ? 'success'
                : 'danger'
            }
          >
            {message}
          </Feedback>
        )}

        <section className="governancePanel" aria-labelledby="governance-title">
          <div className="governancePanelIntro">
            <div>
              <span className="sectionEyebrow">Governance actions</span>
              <h2 id="governance-title">Choose one sensitive workflow</h2>
            </div>
            <p>Only one workflow is shown at a time so you can review the consequences before confirming.</p>
          </div>

          <div className="governanceTabs" role="tablist" aria-label="Governance tasks">
            <button
              type="button"
              role="tab"
              aria-selected={activeTask === 'promote'}
              onClick={() => setActiveTask('promote')}
            >
              <span className="governanceTabIndex">01</span>
              <span>
                <strong>Promote a user</strong>
                <small>Grant Administrator responsibilities</small>
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTask === 'propose'}
              onClick={() => setActiveTask('propose')}
            >
              <span className="governanceTabIndex">02</span>
              <span>
                <strong>Transfer ownership</strong>
                <small>Nominate an Administrator as successor</small>
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTask === 'accept'}
              onClick={() => setActiveTask('accept')}
            >
              <span className="governanceTabIndex">03</span>
              <span>
                <strong>Review a transfer</strong>
                <small>{proposals.length ? `${proposals.length} awaiting your response` : 'No proposals awaiting you'}</small>
              </span>
            </button>
          </div>

          <div className="governanceTask">
            {activeTask === 'promote' && (
              <form onSubmit={promote}>
                <div className="taskHeading">
                  <span>01</span>
                  <div>
                    <h2>Promote a user</h2>
                    <p>The selected person becomes an Administrator and must sign in again.</p>
                  </div>
                </div>
                <div className="governanceFormGrid">
                  <label>
                    Active user
                    <select name="membershipId" required>
                      <option value="">
                        {loading ? 'Loading eligible Users…' : 'Select an eligible User'}
                      </option>
                      {collaborators
                        .filter(
                          (collaborator) =>
                            collaborator.profile === 'User' && collaborator.status === 'ACTIVE',
                        )
                        .map((collaborator) => (
                          <option key={collaborator.id} value={collaborator.id}>
                            {collaborator.identity.email}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Reason
                    <input name="reason" required placeholder="Why is this promotion needed?" />
                  </label>
                </div>
                {confirmation}
                <div className="governanceActions">
                  <button disabled={submitting || loading}>Promote to administrator</button>
                </div>
              </form>
            )}

            {activeTask === 'propose' && (
              <form onSubmit={propose}>
                <div className="taskHeading">
                  <span>02</span>
                  <div>
                    <h2>Transfer ownership</h2>
                    <p>The nominated Administrator must accept before ownership changes.</p>
                  </div>
                </div>
                <div className="governanceFormGrid">
                  <label>
                    Successor administrator
                    <select name="membershipId" required>
                      <option value="">
                        {loading
                          ? 'Loading eligible Administrators…'
                          : 'Select an eligible Administrator'}
                      </option>
                      {collaborators
                        .filter(
                          (collaborator) =>
                            collaborator.profile === 'Administrator' &&
                            collaborator.status === 'ACTIVE' &&
                            !collaborator.ownership,
                        )
                        .map((collaborator) => (
                          <option key={collaborator.id} value={collaborator.id}>
                            {collaborator.identity.email}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Reason
                    <input name="reason" required placeholder="Why should ownership change?" />
                  </label>
                </div>
                {confirmation}
                <div className="governanceActions">
                  <button disabled={submitting || loading}>Propose transfer</button>
                </div>
              </form>
            )}

            {activeTask === 'accept' && (
              <form onSubmit={accept}>
                <div className="taskHeading">
                  <span>03</span>
                  <div>
                    <h2>Review an ownership transfer</h2>
                    <p>Accepting makes you the organization owner and signs you out immediately.</p>
                  </div>
                </div>
                <div className="governanceFormGrid">
                  <label>
                    Pending proposal
                    <select name="proposalId" required>
                      <option value="">
                        {loading
                          ? 'Loading pending proposals…'
                          : 'Select a proposal addressed to you'}
                      </option>
                      {proposals.map((proposal) => (
                        <option key={proposal.id} value={proposal.id}>
                          From {proposal.proposerEmail} · expires{' '}
                          {new Date(proposal.expiresAt).toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Reason
                    <input name="reason" required placeholder="Why are you accepting this transfer?" />
                  </label>
                </div>
                {confirmation}
                <div className="governanceActions">
                  <button disabled={submitting || loading || proposals.length === 0}>
                    Accept transfer
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </section>
    </AppShell>
  );
}

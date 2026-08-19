'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import '../../styles.css';
import { AppShell, Feedback, PageHeader, tenantNav } from '../../components/ui';
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
    <label>
      <input name="confirmed" type="checkbox" required /> I understand this sensitive change.
    </label>
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
          <article><span>Active administrators</span><strong>{collaborators.filter((item) => item.profile === 'Administrator' && item.status === 'ACTIVE').length}</strong><small>Including the current owner</small></article>
          <article><span>Eligible for promotion</span><strong>{collaborators.filter((item) => item.profile === 'User' && item.status === 'ACTIVE').length}</strong><small>Active users</small></article>
          <article><span>Pending transfers</span><strong>{proposals.length}</strong><small>Addressed to your account</small></article>
        </div>
        {message && <Feedback tone={message.startsWith('User promoted') || message === 'Ownership transfer proposed.' ? 'success' : 'danger'}>{message}</Feedback>}
        <article className="governancePanel">
          <header><span className="sectionEyebrow">Choose a governance task</span><h2>What do you need to change?</h2><p>Only the selected workflow is shown, keeping unrelated sensitive actions out of the way.</p></header>
          <div className="governanceTabs" role="tablist" aria-label="Governance tasks">
            <button type="button" role="tab" aria-selected={activeTask === 'promote'} onClick={() => setActiveTask('promote')}><strong>Promote a user</strong><span>Give an active user administrator responsibilities</span></button>
            <button type="button" role="tab" aria-selected={activeTask === 'propose'} onClick={() => setActiveTask('propose')}><strong>Transfer ownership</strong><span>Nominate an existing administrator as successor</span></button>
            <button type="button" role="tab" aria-selected={activeTask === 'accept'} onClick={() => setActiveTask('accept')}><strong>Review a transfer</strong><span>{proposals.length ? `${proposals.length} awaiting your response` : 'No proposals awaiting you'}</span></button>
          </div>
          <div className="governanceTask">
        {activeTask === 'promote' && <form onSubmit={promote}>
          <div className="taskHeading"><span>01</span><div><h2>Promote a user</h2><p>The person will receive administrator responsibilities and must sign in again.</p></div></div>
          <label>
            Active User
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
            <input name="reason" required />
          </label>
          {confirmation}
          <button disabled={submitting || loading}>Promote to administrator</button>
        </form>}
        {activeTask === 'propose' && <form onSubmit={propose}>
          <div className="taskHeading"><span>02</span><div><h2>Propose an ownership transfer</h2><p>The successor must accept before ownership changes.</p></div></div>
          <label>
            Successor Administrator
            <select name="membershipId" required>
              <option value="">
                {loading ? 'Loading eligible Administrators…' : 'Select an eligible Administrator'}
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
            <input name="reason" required />
          </label>
          {confirmation}
          <button disabled={submitting || loading}>Propose transfer</button>
        </form>}
        {activeTask === 'accept' && <form onSubmit={accept}>
          <div className="taskHeading"><span>03</span><div><h2>Review an ownership transfer</h2><p>Accepting signs you out and makes you the organization owner.</p></div></div>
          <label>
            Pending proposal
            <select name="proposalId" required>
              <option value="">
                {loading ? 'Loading pending proposals…' : 'Select a proposal addressed to you'}
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
            <input name="reason" required />
          </label>
          {confirmation}
          <button disabled={submitting || loading || proposals.length === 0}>
            Accept transfer
          </button>
        </form>}
          </div>
        </article>
      </section>
    </AppShell>
  );
}

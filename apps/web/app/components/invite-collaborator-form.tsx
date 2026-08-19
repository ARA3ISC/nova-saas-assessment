'use client';
import { FormEvent, useEffect, useState } from 'react';

type Preset = { id: string; key: string; label: string; version: number };

function csrfToken(): string | undefined {
  return document.cookie
    .split('; ')
    .find((item) => item.startsWith('nova_csrf='))
    ?.split('=')[1];
}

export function InviteCollaboratorForm() {
  const [message, setMessage] = useState('');
  const [presets, setPresets] = useState<Preset[]>([]);
  useEffect(() => {
    void fetch('/api/permission-presets', { credentials: 'include' })
      .then(async (response) =>
        response.ok ? setPresets((await response.json()) as Preset[]) : undefined,
      )
      .catch(() => undefined);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = form.get('email');
    const presetId = form.get('presetId');
    const token = csrfToken();
    const response = await fetch('/api/invitations/collaborator', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
      body: JSON.stringify({ email, ...(presetId ? { presetId } : {}) }),
    });
    setMessage(
      response.ok
        ? 'Invitation created and queued for delivery.'
        : 'We could not create this invitation. Check your current access.',
    );
  }
  return (
    <form onSubmit={submit} className="inviteForm">
      <label>
        Collaborator email
        <input name="email" type="email" required placeholder="name@example.com" />
      </label>
      <label>
        Starting preset
        <select name="presetId">
          <option value="">Custom explicit grants</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label} v{preset.version}
            </option>
          ))}
        </select>
      </label>
      <button>Invite collaborator</button>
      {message && <span role="status">{message}</span>}
    </form>
  );
}

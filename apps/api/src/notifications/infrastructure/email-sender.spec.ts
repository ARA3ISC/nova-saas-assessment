import { randomUUID } from 'node:crypto';
import { TransactionalEmailTemplate } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecordingEmailSender, renderTransactionalEmail } from './email-sender';

describe('RecordingEmailSender', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('records an allowlisted delivery request deterministically', async () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://nova.example.test');
    const sender = new RecordingEmailSender();
    const deliveryKey = randomUUID();
    await expect(
      sender.send({
        to: 'demo@example.test',
        template: TransactionalEmailTemplate.COLLABORATOR_INVITATION_V1,
        actionUrl: 'https://nova.example.test/invitations/collaborator/accept?token=secret',
        deliveryKey,
      }),
    ).resolves.toBe('recorded-1');
    expect(sender.sent).toEqual([
      {
        to: 'demo@example.test',
        template: TransactionalEmailTemplate.COLLABORATOR_INVITATION_V1,
        actionUrl: 'https://nova.example.test/invitations/collaborator/accept?token=secret',
        deliveryKey,
      },
    ]);
  });

  it('rejects a mismatched template route or untrusted origin', () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://nova.example.test');
    const base = {
      to: 'demo@example.test',
      template: TransactionalEmailTemplate.PASSWORD_RESET_V1,
      deliveryKey: randomUUID(),
    };

    expect(() =>
      renderTransactionalEmail({
        ...base,
        actionUrl: 'https://attacker.example/password-reset/complete?token=secret',
      }),
    ).toThrow('EMAIL_ACTION_URL_NOT_ALLOWED');
    expect(() =>
      renderTransactionalEmail({
        ...base,
        actionUrl: 'https://nova.example.test/invitations/collaborator/accept?token=secret',
      }),
    ).toThrow('EMAIL_ACTION_URL_NOT_ALLOWED');
  });
});

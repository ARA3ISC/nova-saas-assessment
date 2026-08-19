import { afterEach, describe, expect, it, vi } from 'vitest';

import { decryptInitialOwnerEnvelope, encryptInitialOwnerEnvelope } from './envelope';

describe('transactional email envelope', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('encrypts the invitation token and restores it only with the configured key', () => {
    vi.stubEnv('EMAIL_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));

    const encrypted = encryptInitialOwnerEnvelope({ token: 'secret-invitation-token' });

    expect(encrypted).not.toContain('secret-invitation-token');
    expect(decryptInitialOwnerEnvelope(encrypted)).toEqual({
      token: 'secret-invitation-token',
    });
  });

  it('rejects an absent or incorrectly sized encryption key', () => {
    vi.stubEnv('EMAIL_ENCRYPTION_KEY', 'not-a-32-byte-key');

    expect(() => encryptInitialOwnerEnvelope({ token: 'token' })).toThrow(
      'EMAIL_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    );
  });
});

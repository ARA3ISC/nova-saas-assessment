import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  generateInvitationToken,
  hashInvitationToken,
  isInvitationExpired,
  normalizeInvitationEmail,
  validateInvitationInput,
} from './invitation';

describe('Invitation domain', () => {
  it('normalizes invitation emails', () => {
    expect(
      normalizeInvitationEmail(
        '  User@Example.COM ',
      ),
    ).toBe('user@example.com');
  });

  it('generates secure-looking unique tokens', () => {
    const first = generateInvitationToken();
    const second = generateInvitationToken();

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it('hashes tokens deterministically', () => {
    const token = 'invitation-token';

    expect(hashInvitationToken(token)).toBe(
      hashInvitationToken(token),
    );

    expect(hashInvitationToken(token)).not.toBe(token);
  });

  it('detects expired invitations', () => {
    const now = new Date('2026-08-17T12:00:00.000Z');

    expect(
      isInvitationExpired(
        new Date('2026-08-17T11:59:59.000Z'),
        now,
      ),
    ).toBe(true);

    expect(
      isInvitationExpired(
        new Date('2026-08-17T12:00:01.000Z'),
        now,
      ),
    ).toBe(false);
  });

  it('accepts a valid collaborator invitation', () => {
    expect(() =>
      validateInvitationInput({
        email: 'user@example.com',
        kind: 'COLLABORATOR',
        targetProfile: 'User',
      }),
    ).not.toThrow();
  });

  it('requires administrators for initial owner invitations', () => {
    expect(() =>
      validateInvitationInput({
        email: 'owner@example.com',
        kind: 'INITIAL_OWNER',
        targetProfile: 'User',
      }),
    ).toThrow(
      'INITIAL_OWNER invitations must target Administrator',
    );
  });

  it('rejects empty emails', () => {
    expect(() =>
      validateInvitationInput({
        email: '',
        kind: 'COLLABORATOR',
        targetProfile: 'User',
      }),
    ).toThrow('email is required');
  });
});

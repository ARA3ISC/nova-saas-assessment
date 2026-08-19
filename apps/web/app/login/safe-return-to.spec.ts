import { describe, expect, it } from 'vitest';

import { safeReturnTo } from './safe-return-to';

describe('safeReturnTo', () => {
  it('preserves an internal invitation path and query', () => {
    expect(safeReturnTo('/invitations/collaborator/accept?token=opaque-invitation-token')).toBe(
      '/invitations/collaborator/accept?token=opaque-invitation-token',
    );
  });

  it('rejects external, protocol-relative, and recursive login redirects', () => {
    expect(safeReturnTo('https://attacker.example/path')).toBe('/');
    expect(safeReturnTo('//attacker.example/path')).toBe('/');
    expect(safeReturnTo('/login?returnTo=/platform')).toBe('/');
  });
});

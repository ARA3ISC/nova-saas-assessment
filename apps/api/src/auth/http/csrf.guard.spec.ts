import { describe, expect, it } from 'vitest';
import { CsrfGuard, CSRF_COOKIE_NAME } from './csrf.guard';

describe('CsrfGuard', () => {
  it('allows safe read methods without a CSRF token', () => {
    const guard = new CsrfGuard();
    expect(guard.canActivate(context({ method: 'GET', cookies: {}, headers: {} }))).toBe(true);
  });
  const context = (request: Record<string, unknown>) =>
    ({ switchToHttp: () => ({ getRequest: () => request }) }) as never;
  it('accepts a matching cookie and header proof', () => {
    expect(
      new CsrfGuard().canActivate(
        context({ cookies: { [CSRF_COOKIE_NAME]: 'proof' }, headers: { 'x-csrf-token': 'proof' } }),
      ),
    ).toBe(true);
  });
  it('refuses absent or mismatched proof', () => {
    expect(() =>
      new CsrfGuard().canActivate(
        context({ cookies: { [CSRF_COOKIE_NAME]: 'proof' }, headers: { 'x-csrf-token': 'other' } }),
      ),
    ).toThrow('CSRF validation failed');
  });
});

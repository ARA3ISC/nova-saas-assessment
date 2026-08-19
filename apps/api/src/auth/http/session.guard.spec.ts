import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { SessionGuard } from './session.guard';

function context(request: object): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
}

describe('SessionGuard', () => {
  it('authenticates a valid session without resolving tenant access', async () => {
    const session = { id: 'session-id', identityId: 'platform-identity' };
    const authService = { validateSession: vi.fn().mockResolvedValue(session) };
    const request = { cookies: { nova_session: 'opaque-token' } } as Record<string, unknown>;
    const guard = new SessionGuard(authService as never);

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request.authSession).toEqual(session);
    expect(authService.validateSession).toHaveBeenCalledWith('opaque-token');
  });

  it('rejects a missing session cookie', async () => {
    const guard = new SessionGuard({ validateSession: vi.fn() } as never);
    await expect(guard.canActivate(context({ cookies: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired or unknown session', async () => {
    const guard = new SessionGuard({ validateSession: vi.fn().mockResolvedValue(null) } as never);
    await expect(
      guard.canActivate(context({ cookies: { nova_session: 'expired-token' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

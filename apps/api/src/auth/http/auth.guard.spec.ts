import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AuthGuard } from './auth.guard';
import { SESSION_COOKIE_NAME } from './session-cookie';
import { AuthService } from '../application/auth.service';
import { AccessService } from '../../access/application/access.service';

function createContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  it('rejects requests without a session cookie', async () => {
    const authService = {
      validateSession: vi.fn(),
    } as unknown as AuthService;

    const accessService = {
      resolveEffectiveAccess: vi.fn(),
    } as unknown as AccessService;

    const guard = new AuthGuard(authService, accessService);

    await expect(guard.canActivate(createContext({ cookies: {} }))).rejects.toThrow(
      UnauthorizedException,
    );

    expect(authService.validateSession).not.toHaveBeenCalled();
    expect(accessService.resolveEffectiveAccess).not.toHaveBeenCalled();
  });

  it('rejects invalid sessions', async () => {
    const authService = {
      validateSession: vi.fn().mockResolvedValue(null),
    } as unknown as AuthService;

    const accessService = {
      resolveEffectiveAccess: vi.fn(),
    } as unknown as AccessService;

    const guard = new AuthGuard(authService, accessService);

    await expect(
      guard.canActivate(
        createContext({
          cookies: {
            [SESSION_COOKIE_NAME]: 'invalid-token',
          },
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(authService.validateSession).toHaveBeenCalledWith('invalid-token');

    expect(accessService.resolveEffectiveAccess).not.toHaveBeenCalled();
  });

  it('rejects authenticated sessions without effective access', async () => {
    const session = {
      id: 'session-id',
      identityId: 'identity-id',
    };

    const authService = {
      validateSession: vi.fn().mockResolvedValue(session),
    } as unknown as AuthService;

    const accessService = {
      resolveEffectiveAccess: vi.fn().mockRejectedValue(new UnauthorizedException('Access denied')),
    } as unknown as AccessService;

    const guard = new AuthGuard(authService, accessService);

    await expect(
      guard.canActivate(
        createContext({
          cookies: {
            [SESSION_COOKIE_NAME]: 'valid-token',
          },
        }),
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(accessService.resolveEffectiveAccess).toHaveBeenCalledWith('identity-id');
  });

  it('allows valid sessions and attaches session and effective access to the request', async () => {
    const session = {
      id: 'session-id',
      identityId: 'identity-id',
    };

    const effectiveAccess = {
      identityId: 'identity-id',
      organizationId: 'organization-id',
      membershipId: 'membership-id',
      profile: 'Administrator' as const,
      accessEpoch: 1,
    };

    const authService = {
      validateSession: vi.fn().mockResolvedValue(session),
    } as unknown as AuthService;

    const accessService = {
      resolveEffectiveAccess: vi.fn().mockResolvedValue(effectiveAccess),
    } as unknown as AccessService;

    const guard = new AuthGuard(authService, accessService);

    const request: {
      cookies: Record<string, string>;
      authSession?: typeof session;
      effectiveAccess?: typeof effectiveAccess;
    } = {
      cookies: {
        [SESSION_COOKIE_NAME]: 'valid-token',
      },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(request.authSession).toEqual(session);
    expect(request.effectiveAccess).toEqual(effectiveAccess);

    expect(authService.validateSession).toHaveBeenCalledWith('valid-token');

    expect(accessService.resolveEffectiveAccess).toHaveBeenCalledWith('identity-id');
  });
});

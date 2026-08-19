import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../auth/application/auth.service';
import { PlatformRepository } from '../infrastructure/platform.repository';
import { PlatformGuard } from './platform.guard';
import { SESSION_COOKIE_NAME } from '../../auth/http/session-cookie';

describe('PlatformGuard', () => {
  function createContext(request: Record<string, unknown>) {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as never;
  }

  function createGuard() {
    const authService = {
      validateSession: vi.fn(),
    } as unknown as AuthService;
    const platformRepository = {
      findPlatformPrincipalByIdentity: vi.fn(),
    } as unknown as PlatformRepository;

    return {
      authService,
      platformRepository,
      guard: new PlatformGuard(authService, platformRepository),
    };
  }

  it('refuses a request without a session cookie', async () => {
    const { guard, authService } = createGuard();

    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authService.validateSession).not.toHaveBeenCalled();
  });

  it('refuses a valid customer session without a platform principal', async () => {
    const { guard, authService, platformRepository } = createGuard();
    const request = { cookies: { [SESSION_COOKIE_NAME]: 'session-token' } };

    vi.mocked(authService.validateSession).mockResolvedValue({
      id: 'session-id',
      identityId: 'identity-id',
    } as Awaited<ReturnType<AuthService['validateSession']>>);
    vi.mocked(platformRepository.findPlatformPrincipalByIdentity).mockResolvedValue(null);

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches a valid platform session without resolving customer access', async () => {
    const { guard, authService, platformRepository } = createGuard();
    const request = { cookies: { [SESSION_COOKIE_NAME]: 'session-token' } };
    const session = {
      id: 'session-id',
      identityId: 'identity-id',
    } as Awaited<ReturnType<AuthService['validateSession']>>;

    vi.mocked(authService.validateSession).mockResolvedValue(session);
    vi.mocked(platformRepository.findPlatformPrincipalByIdentity).mockResolvedValue({
      id: 'platform-principal-id',
      identityId: 'identity-id',
      identity: { id: 'identity-id', status: 'ACTIVE' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({ authSession: session });
  });
});

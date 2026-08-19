import { AuthThrottleService } from './auth.throttle';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import { AuthRepository } from '../infrastructure/auth.repository';

describe('AuthService', () => {
  it('creates a session with expiration dates', async () => {
    const repository = {
      createSession: vi.fn().mockResolvedValue({}),
    } as unknown as AuthRepository;

    const throttle = {} as AuthThrottleService;

    const service = new AuthService(repository, throttle);

    const result = await service.createSession('identity-id');

    expect(result.token).toBeTruthy();
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(result.absoluteExpiresAt.getTime()).toBeGreaterThan(result.expiresAt.getTime());

    expect(repository.createSession).toHaveBeenCalledOnce();
  });

  it('validates a session through the repository', async () => {
    const session = { id: 'session-id' };

    const repository = {
      findValidSession: vi.fn().mockResolvedValue(session),
    } as unknown as AuthRepository;

    const throttle = {} as AuthThrottleService;

    const service = new AuthService(repository, throttle);

    await expect(service.validateSession('token')).resolves.toEqual(session);
    expect(repository.findValidSession).toHaveBeenCalledWith('token');
  });

  it('revokes a session through the repository', async () => {
    const repository = {
      revokeSession: vi.fn().mockResolvedValue({}),
    } as unknown as AuthRepository;

    const throttle = {} as AuthThrottleService;

    const service = new AuthService(repository, throttle);

    await service.revokeSession('token');

    expect(repository.revokeSession).toHaveBeenCalledWith('token');
  });

  it('rejects an expired session', async () => {
    const repository = {
      findValidSession: vi.fn().mockResolvedValue(null),
    } as unknown as AuthRepository;

    const throttle = {} as AuthThrottleService;

    const service = new AuthService(repository, throttle);

    await expect(service.validateSession('expired-token')).resolves.toBeNull();

    expect(repository.findValidSession).toHaveBeenCalledWith('expired-token');
  });

  it('rejects a revoked session', async () => {
    const repository = {
      findValidSession: vi.fn().mockResolvedValue(null),
    } as unknown as AuthRepository;

    const throttle = {} as AuthThrottleService;

    const service = new AuthService(repository, throttle);

    await expect(service.validateSession('revoked-token')).resolves.toBeNull();

    expect(repository.findValidSession).toHaveBeenCalledWith('revoked-token');
  });
});

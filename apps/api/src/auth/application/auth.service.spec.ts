import { describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth.service';
import { AuthRepository } from '../infrastructure/auth.repository';

describe('AuthService', () => {
  it('creates a session with expiration dates', async () => {
    const repository = {
      createSession: vi.fn().mockResolvedValue({}),
    } as unknown as AuthRepository;

    const service = new AuthService(repository);

    const result = await service.createSession('identity-id');

    expect(result.token).toBeTruthy();
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(result.absoluteExpiresAt.getTime()).toBeGreaterThan(
      result.expiresAt.getTime(),
    );

    expect(repository.createSession).toHaveBeenCalledOnce();
  });

  it('validates a session through the repository', async () => {
    const session = { id: 'session-id' };

    const repository = {
      findValidSession: vi.fn().mockResolvedValue(session),
    } as unknown as AuthRepository;

    const service = new AuthService(repository);

    await expect(service.validateSession('token')).resolves.toEqual(session);
    expect(repository.findValidSession).toHaveBeenCalledWith('token');
  });

  it('revokes a session through the repository', async () => {
    const repository = {
      revokeSession: vi.fn().mockResolvedValue({}),
    } as unknown as AuthRepository;

    const service = new AuthService(repository);

    await service.revokeSession('token');

    expect(repository.revokeSession).toHaveBeenCalledWith('token');
  });
});

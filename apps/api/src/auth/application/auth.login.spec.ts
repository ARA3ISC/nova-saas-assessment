import { describe, expect, it, vi } from 'vitest';
import { AuthThrottleService } from './auth.throttle';
import { AuthService } from './auth.service';
import { AuthRepository } from '../infrastructure/auth.repository';

describe('AuthService.login', () => {
  it('returns a session for valid credentials', async () => {
    const repository = {
      findIdentityByEmail: vi.fn().mockResolvedValue({
        id: 'identity-id',
        status: 'ACTIVE',
        passwordCredential: {
          passwordHash: await import('argon2').then((argon2) => argon2.hash('correct-password')),
        },
      }),
      createSession: vi.fn().mockResolvedValue({}),
    } as unknown as AuthRepository;

    const throttle = {
      isLocked: vi.fn().mockResolvedValue(false),
      recordFailure: vi.fn().mockResolvedValue(undefined),
      clearAccountFailures: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthThrottleService;

    const service = new AuthService(repository, throttle);

    const result = await service.login(' User@Example.com ', 'correct-password', 'source-a');

    expect(result).not.toBeNull();
    expect(repository.findIdentityByEmail).toHaveBeenCalledWith('user@example.com');
  });

  it('rejects an invalid password', async () => {
    const repository = {
      findIdentityByEmail: vi.fn().mockResolvedValue({
        id: 'identity-id',
        status: 'ACTIVE',
        passwordCredential: {
          passwordHash: await import('argon2').then((argon2) => argon2.hash('correct-password')),
        },
      }),
    } as unknown as AuthRepository;

    const throttle = {
      isLocked: vi.fn().mockResolvedValue(false),
      recordFailure: vi.fn().mockResolvedValue(undefined),
      clearAccountFailures: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthThrottleService;
    const service = new AuthService(repository, throttle);

    const result = await service.login('user@example.com', 'wrong-password', 'source-a');

    expect(result).toBeNull();
  });

  it('rejects an unknown email', async () => {
    const repository = {
      findIdentityByEmail: vi.fn().mockResolvedValue(null),
    } as unknown as AuthRepository;

    const throttle = {
      isLocked: vi.fn().mockResolvedValue(false),
      recordFailure: vi.fn().mockResolvedValue(undefined),
      clearAccountFailures: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthThrottleService;
    const service = new AuthService(repository, throttle);

    const result = await service.login('unknown@example.com', 'anything', 'source-a');

    expect(result).toBeNull();
  });

  it('rejects disabled identities', async () => {
    const repository = {
      findIdentityByEmail: vi.fn().mockResolvedValue({
        id: 'identity-id',
        status: 'DISABLED',
        passwordCredential: {
          passwordHash: 'unused',
        },
      }),
    } as unknown as AuthRepository;

    const throttle = {
      isLocked: vi.fn().mockResolvedValue(false),
      recordFailure: vi.fn().mockResolvedValue(undefined),
      clearAccountFailures: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuthThrottleService;

    const service = new AuthService(repository, throttle);

    const result = await service.login('user@example.com', 'correct-password', 'source-a');

    expect(result).toBeNull();
  });
});

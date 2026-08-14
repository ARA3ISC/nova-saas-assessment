import { describe, expect, it, vi } from 'vitest';

import { AuthThrottleService } from './auth.throttle';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuthThrottleService', () => {
  it('is not locked when no throttle record exists', async () => {
    const prisma = {
      authenticationThrottle: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    const service = new AuthThrottleService(prisma);

    await expect(
      service.isLocked('user@example.com', 'login'),
    ).resolves.toBe(false);
  });

  it('is locked when lockedUntil is in the future', async () => {
    const prisma = {
      authenticationThrottle: {
        findUnique: vi.fn().mockResolvedValue({
          lockedUntil: new Date(Date.now() + 60_000),
        }),
      },
    } as unknown as PrismaService;

    const service = new AuthThrottleService(prisma);

    await expect(
      service.isLocked('user@example.com', 'login'),
    ).resolves.toBe(true);
  });

  it('clears failures', async () => {
    const prisma = {
      authenticationThrottle: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;

    const service = new AuthThrottleService(prisma);

    await service.clearFailures('user@example.com', 'login');

    expect(prisma.authenticationThrottle.deleteMany).toHaveBeenCalledWith({
      where: {
        normalizedAccount: 'user@example.com',
        sourceBucket: 'login',
      },
    });
  });
});

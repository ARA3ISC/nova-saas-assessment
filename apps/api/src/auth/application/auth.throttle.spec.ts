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

	it('records a failed attempt', async () => {
		const prisma = {
			authenticationThrottle: {
				findUnique: vi.fn().mockResolvedValue(null),
				upsert: vi.fn().mockResolvedValue({}),
			},
		} as unknown as PrismaService;

		const service = new AuthThrottleService(prisma);

		await service.recordFailure('user@example.com', 'login');

		expect(prisma.authenticationThrottle.upsert).toHaveBeenCalledWith({
			where: {
				normalizedAccount_sourceBucket: {
					normalizedAccount: 'user@example.com',
					sourceBucket: 'login',
				},
			},
			create: expect.objectContaining({
				normalizedAccount: 'user@example.com',
				sourceBucket: 'login',
				failureCount: 1,
				firstFailedAt: expect.any(Date),
				lastFailedAt: expect.any(Date),
				lockedUntil: null,
			}),
			update: expect.objectContaining({
				failureCount: 1,
				lastFailedAt: expect.any(Date),
				lockedUntil: null,
			}),
		});
	});

	it('locks after the fifth failed attempt', async () => {
		const prisma = {
			authenticationThrottle: {
				findUnique: vi.fn().mockResolvedValue({
					failureCount: 4,
					firstFailedAt: new Date(),
					lastFailedAt: new Date(),
					lockedUntil: null,
				}),
				upsert: vi.fn().mockResolvedValue({}),
			},
		} as unknown as PrismaService;

		const service = new AuthThrottleService(prisma);

		await service.recordFailure('user@example.com', 'login');

		expect(prisma.authenticationThrottle.upsert).toHaveBeenCalledWith({
			where: {
				normalizedAccount_sourceBucket: {
					normalizedAccount: 'user@example.com',
					sourceBucket: 'login',
				},
			},
			create: expect.any(Object),
			update: expect.objectContaining({
				failureCount: 5,
				lastFailedAt: expect.any(Date),
				lockedUntil: expect.any(Date),
			}),
		});
	});
});

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthThrottleService } from './auth.throttle';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

describe('Authentication throttle concurrency', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('counts parallel failures without losing account or source increments', async () => {
    const nonce = randomUUID();
    const account = `${nonce}@example.test`;
    const source = `source-${nonce}`;
    const service = new AuthThrottleService(prisma as never);

    try {
      await Promise.all(
        Array.from({ length: 5 }, () => service.recordFailure(account, source, 'login')),
      );

      const rows = await prisma.authenticationThrottle.findMany({
        where: {
          OR: [
            { normalizedAccount: account, sourceBucket: 'login:ACCOUNT' },
            { normalizedAccount: 'login:SOURCE', sourceBucket: source },
          ],
        },
        select: { failureCount: true, lockedUntil: true },
      });

      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.failureCount === 5)).toBe(true);
      expect(rows.every((row) => row.lockedUntil && row.lockedUntil > new Date())).toBe(true);
      await expect(service.isLocked(account, source, 'login')).resolves.toBe(true);
    } finally {
      await prisma.authenticationThrottle.deleteMany({
        where: {
          OR: [
            { normalizedAccount: account, sourceBucket: 'login:ACCOUNT' },
            { normalizedAccount: 'login:SOURCE', sourceBucket: source },
          ],
        },
      });
    }
  });
});

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

const MAX_FAILURES = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const ACCOUNT_BUCKET = 'ACCOUNT';
const SOURCE_ACCOUNT = 'SOURCE';

@Injectable()
export class AuthThrottleService {
  constructor(private readonly prisma: PrismaService) {}

  async isLocked(
    normalizedAccount: string,
    sourceBucket: string,
    purpose = 'login',
  ): Promise<boolean> {
    const throttles = await this.prisma.authenticationThrottle.findMany({
      where: {
        OR: [
          { normalizedAccount, sourceBucket: `${purpose}:${ACCOUNT_BUCKET}` },
          { normalizedAccount: `${purpose}:${SOURCE_ACCOUNT}`, sourceBucket },
        ],
      },
      select: { lockedUntil: true },
    });
    return throttles.some(
      (throttle) => throttle.lockedUntil && throttle.lockedUntil.getTime() > Date.now(),
    );
  }

  async recordFailure(
    normalizedAccount: string,
    sourceBucket: string,
    purpose = 'login',
  ): Promise<void> {
    await Promise.all([
      this.recordBucket(normalizedAccount, `${purpose}:${ACCOUNT_BUCKET}`),
      this.recordBucket(`${purpose}:${SOURCE_ACCOUNT}`, sourceBucket),
    ]);
  }

  private async recordBucket(normalizedAccount: string, sourceBucket: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Serialize each logical bucket so parallel failures cannot lose an
      // increment and weaken the lock threshold.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${normalizedAccount}:${sourceBucket}`}, 0)
        )
      `;
      const now = new Date();
      const existing = await tx.authenticationThrottle.findUnique({
        where: {
          normalizedAccount_sourceBucket: {
            normalizedAccount,
            sourceBucket,
          },
        },
      });
      const withinWindow =
        existing?.lastFailedAt &&
        now.getTime() - existing.lastFailedAt.getTime() < LOCK_DURATION_MS;
      const failureCount = (withinWindow ? existing.failureCount : 0) + 1;

      await tx.authenticationThrottle.upsert({
        where: {
          normalizedAccount_sourceBucket: {
            normalizedAccount,
            sourceBucket,
          },
        },
        create: {
          normalizedAccount,
          sourceBucket,
          failureCount: 1,
          firstFailedAt: now,
          lastFailedAt: now,
          lockedUntil:
            failureCount >= MAX_FAILURES ? new Date(now.getTime() + LOCK_DURATION_MS) : null,
        },
        update: {
          failureCount,
          lastFailedAt: now,
          lockedUntil:
            failureCount >= MAX_FAILURES
              ? new Date(now.getTime() + LOCK_DURATION_MS)
              : (existing?.lockedUntil ?? null),
        },
      });
    });
  }

  async clearAccountFailures(normalizedAccount: string, purpose = 'login'): Promise<void> {
    await this.prisma.authenticationThrottle.deleteMany({
      where: {
        normalizedAccount,
        sourceBucket: `${purpose}:${ACCOUNT_BUCKET}`,
      },
    });
  }
}

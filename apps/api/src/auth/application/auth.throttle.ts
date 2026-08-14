import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

const MAX_FAILURES = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

@Injectable()
export class AuthThrottleService {
  constructor(private readonly prisma: PrismaService) {}

  async isLocked(normalizedAccount: string, sourceBucket: string): Promise<boolean> {
    const throttle = await this.prisma.authenticationThrottle.findUnique({
      where: {
        normalizedAccount_sourceBucket: {
          normalizedAccount,
          sourceBucket,
        },
      },
    });

    if (!throttle?.lockedUntil) {
      return false;
    }

    return throttle.lockedUntil.getTime() > Date.now();
  }

  async recordFailure(
    normalizedAccount: string,
    sourceBucket: string,
  ): Promise<void> {
    const now = new Date();

    const existing = await this.prisma.authenticationThrottle.findUnique({
      where: {
        normalizedAccount_sourceBucket: {
          normalizedAccount,
          sourceBucket,
        },
      },
    });

    const failureCount = (existing?.failureCount ?? 0) + 1;

    await this.prisma.authenticationThrottle.upsert({
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
          failureCount >= MAX_FAILURES
            ? new Date(now.getTime() + LOCK_DURATION_MS)
            : null,
      },
      update: {
        failureCount,
        lastFailedAt: now,
        lockedUntil:
          failureCount >= MAX_FAILURES
            ? new Date(now.getTime() + LOCK_DURATION_MS)
            : existing?.lockedUntil ?? null,
      },
    });
  }

  async clearFailures(
    normalizedAccount: string,
    sourceBucket: string,
  ): Promise<void> {
    await this.prisma.authenticationThrottle.deleteMany({
      where: {
        normalizedAccount,
        sourceBucket,
      },
    });
  }
}

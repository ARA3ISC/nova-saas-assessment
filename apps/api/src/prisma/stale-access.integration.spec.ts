import { randomUUID } from 'node:crypto';

import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withTenantContext } from './tenant-transaction';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

describe('stale access transaction protection', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('rolls back an in-flight mutation after the membership epoch changes', async () => {
    const organizationId = randomUUID();
    const identityId = randomUUID();
    const membershipId = randomUUID();
    const companyName = `Stale mutation ${randomUUID()}`;

    await prisma.organization.create({
      data: {
        id: organizationId,
        name: 'Stale access test',
        accessStatus: 'PROVISIONING',
        commercialStatus: 'DEMO',
      },
    });
    await prisma.identity.create({
      data: {
        id: identityId,
        email: `${identityId}@example.test`,
        normalizedEmail: `${identityId}@example.test`,
      },
    });
    await prisma.membership.create({
      data: {
        id: membershipId,
        organizationId,
        identityId,
        profile: 'User',
        status: 'ACTIVE',
        accessEpoch: 0,
      },
    });

    let releaseMutation!: () => void;
    const mutationMayFinish = new Promise<void>((resolve) => {
      releaseMutation = resolve;
    });
    let mutationStarted!: () => void;
    const mutationIsRunning = new Promise<void>((resolve) => {
      mutationStarted = resolve;
    });

    try {
      const mutation = withTenantContext(
        prisma as never,
        { organizationId, actorId: identityId, membershipId, accessEpoch: 0 },
        async (tx) => {
          await tx.company.create({ data: { organizationId, name: companyName } });
          mutationStarted();
          await mutationMayFinish;
        },
      );

      await mutationIsRunning;
      await prisma.membership.update({
        where: { id: membershipId },
        data: { accessEpoch: { increment: 1 } },
      });
      releaseMutation();

      await expect(mutation).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        prisma.company.count({ where: { organizationId, name: companyName } }),
      ).resolves.toBe(0);
    } finally {
      releaseMutation();
      await prisma.membership.deleteMany({ where: { id: membershipId } });
      await prisma.identity.deleteMany({ where: { id: identityId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
  });
});

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CollaboratorLifecycleService } from './collaborator-lifecycle.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

describe('Collaborator grant replacement concurrency', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('accepts one expected version, rejects the stale edit, and revokes the live user session', async () => {
    const organizationId = randomUUID();
    const ownerIdentityId = randomUUID();
    const userIdentityId = randomUUID();
    const ownerMembershipId = randomUUID();
    const userMembershipId = randomUUID();
    await prisma.identity.createMany({
      data: [
        {
          id: ownerIdentityId,
          email: `${ownerIdentityId}@example.test`,
          normalizedEmail: `${ownerIdentityId}@example.test`,
        },
        {
          id: userIdentityId,
          email: `${userIdentityId}@example.test`,
          normalizedEmail: `${userIdentityId}@example.test`,
        },
      ],
    });
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: 'Concurrent permission organization',
        accessStatus: 'PROVISIONING',
      },
    });
    await prisma.$transaction(async (tx) => {
      await tx.membership.createMany({
        data: [
          {
            id: ownerMembershipId,
            organizationId,
            identityId: ownerIdentityId,
            profile: 'Administrator',
          },
          {
            id: userMembershipId,
            organizationId,
            identityId: userIdentityId,
            profile: 'User',
            organizationWideAccess: true,
          },
        ],
      });
      await tx.organizationOwnership.create({
        data: { organizationId, membershipId: ownerMembershipId },
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: { accessStatus: 'ACTIVE' },
      });
    });
    await prisma.authSession.create({
      data: {
        identityId: userIdentityId,
        tokenHash: `permission-session-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    try {
      const service = new CollaboratorLifecycleService(prisma as never, {} as never);
      const access = {
        identityId: ownerIdentityId,
        organizationId,
        membershipId: ownerMembershipId,
        profile: 'Administrator' as const,
        accessEpoch: 0,
      };
      const replacement = {
        capabilities: [],
        companyIds: [],
        businessScopeIds: [],
        organizationWideAccess: false,
        expectedVersion: 1,
        reason: 'Reduce access after assignment change',
        confirmed: true,
      };

      const outcomes = await Promise.allSettled([
        service.replaceGrants(access, userMembershipId, replacement),
        service.replaceGrants(access, userMembershipId, replacement),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
      await expect(
        prisma.membership.findUnique({
          where: { id: userMembershipId },
          select: { version: true, accessEpoch: true, organizationWideAccess: true },
        }),
      ).resolves.toEqual({ version: 2, accessEpoch: 1, organizationWideAccess: false });
      await expect(
        prisma.authSession.findFirst({
          where: { identityId: userIdentityId },
          select: { revokedAt: true },
        }),
      ).resolves.toEqual({ revokedAt: expect.any(Date) });
      await expect(
        prisma.auditEvidence.findMany({
          where: { organizationId, action: 'COLLABORATOR_GRANTS_REPLACED' },
          select: { before: true, after: true },
        }),
      ).resolves.toEqual([
        {
          before: expect.objectContaining({ version: 1, organizationWideAccess: true }),
          after: expect.objectContaining({ version: 2, organizationWideAccess: false }),
        },
      ]);
    } finally {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.identity.deleteMany({
        where: { id: { in: [ownerIdentityId, userIdentityId] } },
      });
    }
  });
});

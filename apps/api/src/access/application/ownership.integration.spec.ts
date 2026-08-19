import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EffectiveAccess } from './access.service';
import { OwnershipService } from './ownership.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

describe('OwnershipService concurrency', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('accepts a transfer exactly once under concurrent successor requests', async () => {
    const organizationId = randomUUID();
    const ownerIdentityId = randomUUID();
    const successorIdentityId = randomUUID();
    const ownerMembershipId = randomUUID();
    const successorMembershipId = randomUUID();
    const proposalId = randomUUID();

    await prisma.organization.create({
      data: {
        id: organizationId,
        name: 'Concurrent ownership test',
        accessStatus: 'PROVISIONING',
        commercialStatus: 'DEMO',
      },
    });
    await prisma.identity.createMany({
      data: [
        {
          id: ownerIdentityId,
          email: `${ownerIdentityId}@example.test`,
          normalizedEmail: `${ownerIdentityId}@example.test`,
        },
        {
          id: successorIdentityId,
          email: `${successorIdentityId}@example.test`,
          normalizedEmail: `${successorIdentityId}@example.test`,
        },
      ],
    });
    await prisma.$transaction(async (tx) => {
      await tx.membership.createMany({
        data: [
          {
            id: ownerMembershipId,
            organizationId,
            identityId: ownerIdentityId,
            profile: 'Administrator',
            status: 'ACTIVE',
          },
          {
            id: successorMembershipId,
            organizationId,
            identityId: successorIdentityId,
            profile: 'Administrator',
            status: 'ACTIVE',
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
        identityId: ownerIdentityId,
        tokenHash: `former-owner-session-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.authSession.create({
      data: {
        identityId: successorIdentityId,
        tokenHash: `successor-session-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.ownershipTransferProposal.create({
      data: {
        id: proposalId,
        organizationId,
        proposerMembershipId: ownerMembershipId,
        successorMembershipId,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const successorAccess: EffectiveAccess = {
      organizationId,
      identityId: successorIdentityId,
      membershipId: successorMembershipId,
      profile: 'Administrator',
      accessEpoch: 0,
    };

    try {
      const service = new OwnershipService(prisma as never);
      await expect(service.listPending(successorAccess)).resolves.toEqual([
        expect.objectContaining({ id: proposalId, successorMembershipId }),
      ]);
      const outcomes = await Promise.allSettled([
        service.accept(successorAccess, proposalId, 'Accept ownership', true),
        service.accept(successorAccess, proposalId, 'Accept ownership', true),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
      await expect(
        prisma.organizationOwnership.findUnique({
          where: { organizationId },
          select: { membershipId: true },
        }),
      ).resolves.toEqual({ membershipId: successorMembershipId });
      await expect(
        prisma.auditEvidence.count({
          where: { organizationId, action: 'OWNERSHIP_TRANSFER_ACCEPTED' },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.membership.findMany({
          where: { id: { in: [ownerMembershipId, successorMembershipId] } },
          orderBy: { id: 'asc' },
          select: { id: true, accessEpoch: true },
        }),
      ).resolves.toEqual(
        [ownerMembershipId, successorMembershipId].sort().map((id) => ({ id, accessEpoch: 1 })),
      );
      await expect(
        prisma.authSession.count({
          where: {
            identityId: { in: [ownerIdentityId, successorIdentityId] },
            revokedAt: null,
          },
        }),
      ).resolves.toBe(0);

      const demotionProposal = await service.propose(
        { ...successorAccess, accessEpoch: 1 },
        ownerMembershipId,
        'Prepare a follow-up ownership handoff',
        true,
      );
      await expect(
        service.demote(
          { ...successorAccess, accessEpoch: 1 },
          ownerMembershipId,
          'Former owner no longer needs administrative access',
          true,
        ),
      ).resolves.toEqual({ id: ownerMembershipId, profile: 'User', version: 3 });
      await expect(
        prisma.membership.findUnique({
          where: { id: ownerMembershipId },
          select: { profile: true, accessEpoch: true },
        }),
      ).resolves.toEqual({ profile: 'User', accessEpoch: 2 });
      await expect(
        prisma.authSession.findFirst({
          where: { identityId: ownerIdentityId },
          select: { revokedAt: true },
        }),
      ).resolves.toEqual({ revokedAt: expect.any(Date) });
      await expect(
        prisma.auditEvidence.count({
          where: { organizationId, action: 'COLLABORATOR_DEMOTED' },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.ownershipTransferProposal.findUnique({
          where: { id: demotionProposal.id },
          select: { status: true, cancelledAt: true },
        }),
      ).resolves.toEqual({ status: 'CANCELLED', cancelledAt: expect.any(Date) });
    } finally {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.identity.deleteMany({
        where: { id: { in: [ownerIdentityId, successorIdentityId] } },
      });
    }
  });
});

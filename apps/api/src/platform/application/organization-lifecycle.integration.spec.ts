import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashInvitationToken } from '../../invitation/domain/invitation';
import { OrganizationService } from './organization.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

describe('Organization terminal disablement', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('destroys pending access paths while preserving independent commercial management', async () => {
    const organizationId = randomUUID();
    const ownerIdentityId = randomUUID();
    const successorIdentityId = randomUUID();
    const ownerMembershipId = randomUUID();
    const successorMembershipId = randomUUID();
    const invitationId = randomUUID();
    const outboxId = randomUUID();
    const proposalId = randomUUID();
    const inviteEmail = `disabled-invite-${randomUUID()}@example.test`;
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
    await prisma.organization.create({
      data: { id: organizationId, name: `Disable ${organizationId}`, accessStatus: 'PROVISIONING' },
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
            id: successorMembershipId,
            organizationId,
            identityId: successorIdentityId,
            profile: 'Administrator',
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
        identityId: successorIdentityId,
        tokenHash: `disabled-session-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.invitation.create({
      data: {
        id: invitationId,
        organizationId,
        email: inviteEmail,
        normalizedEmail: inviteEmail,
        tokenHash: hashInvitationToken(`disabled-${randomUUID()}`),
        kind: 'COLLABORATOR',
        targetProfile: 'User',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.outboxMessage.create({
      data: {
        id: outboxId,
        organizationId,
        recipient: inviteEmail,
        template: 'COLLABORATOR_INVITATION_V1',
        deliveryKey: randomUUID(),
        encryptedEnvelope: 'pending-sensitive-envelope',
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

    try {
      const service = new OrganizationService(prisma as never, {} as never);
      await service.changeAccessStatus({
        organizationId,
        status: 'DISABLED',
        actorId: ownerIdentityId,
        reason: 'Terminal account closure',
        confirmed: true,
        expectedVersion: 1,
      });

      await expect(
        prisma.organization.findUnique({
          where: { id: organizationId },
          select: { accessStatus: true, commercialStatus: true, version: true, disabledAt: true },
        }),
      ).resolves.toEqual({
        accessStatus: 'DISABLED',
        commercialStatus: 'DEMO',
        version: 2,
        disabledAt: expect.any(Date),
      });
      await expect(
        prisma.authSession.findFirst({
          where: { identityId: successorIdentityId },
          select: { revokedAt: true },
        }),
      ).resolves.toEqual({ revokedAt: expect.any(Date) });
      await expect(
        prisma.invitation.findUnique({ where: { id: invitationId }, select: { revokedAt: true } }),
      ).resolves.toEqual({ revokedAt: expect.any(Date) });
      await expect(
        prisma.outboxMessage.findUnique({
          where: { id: outboxId },
          select: { status: true, encryptedEnvelope: true, lastFailureCode: true },
        }),
      ).resolves.toEqual({
        status: 'EXPIRED',
        encryptedEnvelope: '',
        lastFailureCode: 'ORGANIZATION_DISABLED',
      });
      await expect(
        prisma.ownershipTransferProposal.findUnique({
          where: { id: proposalId },
          select: { status: true, cancelledAt: true },
        }),
      ).resolves.toEqual({ status: 'CANCELLED', cancelledAt: expect.any(Date) });

      await service.changeCommercialStatus({
        organizationId,
        status: 'PILOT',
        actorId: ownerIdentityId,
        reason: 'Record post-closure commercial follow-up',
        confirmed: true,
        expectedVersion: 2,
      });
      await expect(
        prisma.organization.findUnique({
          where: { id: organizationId },
          select: { accessStatus: true, commercialStatus: true, version: true },
        }),
      ).resolves.toEqual({ accessStatus: 'DISABLED', commercialStatus: 'PILOT', version: 3 });
    } finally {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.identity.deleteMany({
        where: { id: { in: [ownerIdentityId, successorIdentityId] } },
      });
    }
  });
});

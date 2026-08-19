import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrganizationService } from './organization.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

describe('Platform intervention tenant boundary', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('cannot broaden a selected Organization intervention to another Organization membership', async () => {
    const organizationA = randomUUID();
    const organizationB = randomUUID();
    const identityA = randomUUID();
    const identityB = randomUUID();
    const ownerIdentityA = randomUUID();
    const ownerIdentityB = randomUUID();
    const membershipA = randomUUID();
    const membershipB = randomUUID();
    const ownerMembershipA = randomUUID();
    const ownerMembershipB = randomUUID();
    const actorId = randomUUID();

    await prisma.organization.createMany({
      data: [
        { id: organizationA, name: 'Intervention A', accessStatus: 'PROVISIONING' },
        { id: organizationB, name: 'Intervention B', accessStatus: 'PROVISIONING' },
      ],
    });
    await prisma.identity.createMany({
      data: [
        {
          id: identityA,
          email: `${identityA}@example.test`,
          normalizedEmail: `${identityA}@example.test`,
        },
        {
          id: identityB,
          email: `${identityB}@example.test`,
          normalizedEmail: `${identityB}@example.test`,
        },
        {
          id: ownerIdentityA,
          email: `${ownerIdentityA}@example.test`,
          normalizedEmail: `${ownerIdentityA}@example.test`,
        },
        {
          id: ownerIdentityB,
          email: `${ownerIdentityB}@example.test`,
          normalizedEmail: `${ownerIdentityB}@example.test`,
        },
      ],
    });
    await prisma.$transaction(async (tx) => {
      await tx.membership.createMany({
        data: [
          {
            id: membershipA,
            organizationId: organizationA,
            identityId: identityA,
            profile: 'User',
          },
          {
            id: membershipB,
            organizationId: organizationB,
            identityId: identityB,
            profile: 'User',
          },
          {
            id: ownerMembershipA,
            organizationId: organizationA,
            identityId: ownerIdentityA,
            profile: 'Administrator',
          },
          {
            id: ownerMembershipB,
            organizationId: organizationB,
            identityId: ownerIdentityB,
            profile: 'Administrator',
          },
        ],
      });
      await tx.organizationOwnership.createMany({
        data: [
          { organizationId: organizationA, membershipId: ownerMembershipA },
          { organizationId: organizationB, membershipId: ownerMembershipB },
        ],
      });
      await tx.organization.updateMany({
        where: { id: { in: [organizationA, organizationB] } },
        data: { accessStatus: 'ACTIVE' },
      });
    });
    await prisma.authSession.create({
      data: {
        identityId: identityA,
        tokenHash: `platform-intervention-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    const service = new OrganizationService(prisma as never, {} as never);
    try {
      await expect(
        service.suspendCollaborator({
          organizationId: organizationA,
          membershipId: membershipB,
          actorId,
          reason: 'Attempted cross-Organization intervention',
          confirmed: true,
        }),
      ).rejects.toThrow('Eligible collaborator not found');
      await expect(
        prisma.membership.findUnique({ where: { id: membershipB }, select: { status: true } }),
      ).resolves.toEqual({ status: 'ACTIVE' });

      const outcomes = await Promise.allSettled([
        service.suspendCollaborator({
          organizationId: organizationA,
          membershipId: membershipA,
          actorId,
          reason: 'Authorized scoped intervention',
          confirmed: true,
        }),
        service.suspendCollaborator({
          organizationId: organizationA,
          membershipId: membershipA,
          actorId,
          reason: 'Concurrent scoped intervention',
          confirmed: true,
        }),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
      await expect(
        prisma.membership.findUnique({
          where: { id: membershipA },
          select: { status: true, version: true, accessEpoch: true },
        }),
      ).resolves.toEqual({ status: 'SUSPENDED', version: 2, accessEpoch: 1 });
      await expect(
        prisma.auditEvidence.count({
          where: { organizationId: organizationA, action: 'PLATFORM_COLLABORATOR_SUSPENDED' },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.authSession.findFirst({
          where: { identityId: identityA },
          select: { revokedAt: true },
        }),
      ).resolves.toEqual({ revokedAt: expect.any(Date) });
    } finally {
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationA, organizationB] } },
      });
      await prisma.identity.deleteMany({
        where: { id: { in: [identityA, identityB, ownerIdentityA, ownerIdentityB] } },
      });
    }
  });
});

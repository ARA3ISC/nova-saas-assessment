import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

describe('ownership database invariants', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const ownerIdentity = randomUUID();
  const otherIdentity = randomUUID();
  const ownerMembership = randomUUID();
  const otherMembership = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: organizationA, name: 'Owner invariant A', accessStatus: 'PROVISIONING' },
        { id: organizationB, name: 'Owner invariant B', accessStatus: 'PROVISIONING' },
      ],
    });
    await prisma.identity.createMany({
      data: [
        {
          id: ownerIdentity,
          email: `${ownerIdentity}@example.test`,
          normalizedEmail: `${ownerIdentity}@example.test`,
        },
        {
          id: otherIdentity,
          email: `${otherIdentity}@example.test`,
          normalizedEmail: `${otherIdentity}@example.test`,
        },
      ],
    });
    await prisma.$transaction(async (tx) => {
      await tx.membership.createMany({
        data: [
          {
            id: ownerMembership,
            organizationId: organizationA,
            identityId: ownerIdentity,
            profile: 'Administrator',
          },
          {
            id: otherMembership,
            organizationId: organizationB,
            identityId: otherIdentity,
            profile: 'Administrator',
          },
        ],
      });
      await tx.organizationOwnership.create({
        data: { organizationId: organizationA, membershipId: ownerMembership },
      });
      await tx.organization.update({
        where: { id: organizationA },
        data: { accessStatus: 'ACTIVE' },
      });
    });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [organizationA, organizationB] } } });
    await prisma.identity.deleteMany({ where: { id: { in: [ownerIdentity, otherIdentity] } } });
    await prisma.$disconnect();
  });

  it('rejects direct suspension, demotion, deletion, or unlinking of an active owner', async () => {
    await expect(
      prisma.membership.update({
        where: { id: ownerMembership },
        data: { status: 'SUSPENDED' },
      }),
    ).rejects.toThrow('active organization requires exactly one active Administrator owner');
    await expect(
      prisma.membership.update({
        where: { id: ownerMembership },
        data: { profile: 'User' },
      }),
    ).rejects.toThrow('active organization requires exactly one active Administrator owner');
    await expect(prisma.membership.delete({ where: { id: ownerMembership } })).rejects.toThrow(
      'active organization requires exactly one active Administrator owner',
    );
    await expect(
      prisma.organizationOwnership.delete({ where: { organizationId: organizationA } }),
    ).rejects.toThrow('active organization requires exactly one active Administrator owner');
  });

  it('rejects cross-Organization proposer and successor membership references', async () => {
    await expect(
      prisma.ownershipTransferProposal.create({
        data: {
          organizationId: organizationA,
          proposerMembershipId: ownerMembership,
          successorMembershipId: otherMembership,
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toThrow();
  });
});

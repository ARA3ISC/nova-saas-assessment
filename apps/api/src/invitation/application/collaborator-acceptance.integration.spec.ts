import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashInvitationToken } from '../domain/invitation';
import { CollaboratorAcceptanceService } from './collaborator-acceptance.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

describe('CollaboratorAcceptanceService concurrency', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  async function createActiveOrganization(organizationId: string) {
    const ownerIdentityId = randomUUID();
    const ownerMembershipId = randomUUID();
    await prisma.identity.create({
      data: {
        id: ownerIdentityId,
        email: `${ownerIdentityId}@example.test`,
        normalizedEmail: `${ownerIdentityId}@example.test`,
      },
    });
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: 'Collaborator acceptance organization',
        accessStatus: 'PROVISIONING',
      },
    });
    await prisma.$transaction(async (tx) => {
      await tx.membership.create({
        data: {
          id: ownerMembershipId,
          organizationId,
          identityId: ownerIdentityId,
          profile: 'Administrator',
        },
      });
      await tx.organizationOwnership.create({
        data: { organizationId, membershipId: ownerMembershipId },
      });
      await tx.organization.update({
        where: { id: organizationId },
        data: { accessStatus: 'ACTIVE' },
      });
    });
    return ownerIdentityId;
  }

  it('consumes one invitation exactly once under concurrent acceptance', async () => {
    const organizationId = randomUUID();
    const token = `collaborator-${randomUUID()}`;
    const normalizedEmail = `concurrent-${randomUUID()}@example.test`;
    const invitationId = randomUUID();

    const ownerIdentityId = await createActiveOrganization(organizationId);
    await prisma.invitation.create({
      data: {
        id: invitationId,
        organizationId,
        email: normalizedEmail,
        normalizedEmail,
        tokenHash: hashInvitationToken(token),
        kind: 'COLLABORATOR',
        targetProfile: 'User',
        expiresAt: new Date(Date.now() + 60_000),
        capabilities: [],
        companyIds: [],
        businessScopeIds: [],
      },
    });

    try {
      const service = new CollaboratorAcceptanceService(prisma as never);
      const outcomes = await Promise.all([
        service.accept({ token, password: 'Concurrent acceptance password 2026' }),
        service.accept({ token, password: 'Concurrent acceptance password 2026' }),
      ]);

      expect(outcomes.sort()).toEqual([false, true]);
      await expect(prisma.identity.count({ where: { normalizedEmail } })).resolves.toBe(1);
      await expect(
        prisma.membership.count({ where: { organizationId, profile: 'User' } }),
      ).resolves.toBe(1);
      await expect(
        prisma.invitation.findUnique({
          where: { id: invitationId },
          select: { consumedAt: true },
        }),
      ).resolves.toEqual({ consumedAt: expect.any(Date) });
    } finally {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.identity.deleteMany({
        where: { OR: [{ normalizedEmail }, { id: ownerIdentityId }] },
      });
    }
  });

  it('reuses removed membership history only through authenticated reinvitation', async () => {
    const organizationId = randomUUID();
    const identityId = randomUUID();
    const membershipId = randomUUID();
    const invitationId = randomUUID();
    const token = `returning-${randomUUID()}`;
    const normalizedEmail = `returning-${randomUUID()}@example.test`;

    const ownerIdentityId = await createActiveOrganization(organizationId);
    await prisma.identity.create({
      data: { id: identityId, email: normalizedEmail, normalizedEmail },
    });
    await prisma.membership.create({
      data: {
        id: membershipId,
        organizationId,
        identityId,
        profile: 'User',
        status: 'REMOVED',
        removedAt: new Date(),
      },
    });
    await prisma.invitation.create({
      data: {
        id: invitationId,
        organizationId,
        email: normalizedEmail,
        normalizedEmail,
        tokenHash: hashInvitationToken(token),
        kind: 'COLLABORATOR',
        targetProfile: 'User',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    try {
      const service = new CollaboratorAcceptanceService(prisma as never);
      await expect(service.acceptExisting(identityId, token)).resolves.toBe(true);
      await expect(
        prisma.membership.findUnique({
          where: { identityId },
          select: { id: true, status: true, removedAt: true, accessEpoch: true },
        }),
      ).resolves.toEqual({
        id: membershipId,
        status: 'ACTIVE',
        removedAt: null,
        accessEpoch: 1,
      });
      await expect(prisma.membership.count({ where: { identityId } })).resolves.toBe(1);
    } finally {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.identity.deleteMany({ where: { id: { in: [identityId, ownerIdentityId] } } });
    }
  });
});

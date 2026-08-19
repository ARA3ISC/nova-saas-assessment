import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CollaboratorInvitationService } from './collaborator-invitation.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

describe('CollaboratorInvitationService concurrency', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('creates only one pending link for simultaneous invitations to the same tenant email', async () => {
    const organizationId = randomUUID();
    const ownerIdentityId = randomUUID();
    const ownerMembershipId = randomUUID();
    const normalizedEmail = `invite-${randomUUID()}@example.test`;
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
        name: 'Concurrent invitation organization',
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

    try {
      const notifications = {
        enqueueCollaboratorInvitation: vi
          .fn()
          .mockImplementation(async () => ({ id: randomUUID() })),
        deliver: vi.fn(),
      };
      const service = new CollaboratorInvitationService(
        prisma as never,
        notifications as never,
        {} as never,
      );
      const access = {
        identityId: ownerIdentityId,
        organizationId,
        membershipId: ownerMembershipId,
        profile: 'Administrator' as const,
        accessEpoch: 0,
      };

      const outcomes = await Promise.allSettled([
        service.invite(access, normalizedEmail),
        service.invite(access, normalizedEmail),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
      await expect(
        prisma.invitation.count({
          where: { organizationId, normalizedEmail, consumedAt: null, revokedAt: null },
        }),
      ).resolves.toBe(1);
      expect(notifications.enqueueCollaboratorInvitation).toHaveBeenCalledTimes(1);
      expect(notifications.deliver).toHaveBeenCalledTimes(1);
    } finally {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.identity.deleteMany({ where: { id: ownerIdentityId } });
    }
  });
});

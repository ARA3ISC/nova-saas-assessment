import { randomUUID } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { hashInvitationToken } from '../../invitation/domain/invitation';
import { OrganizationService } from './organization.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

describe('Initial-owner invitation replacement concurrency', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('creates one replacement and destroys the old pending credential', async () => {
    const organizationId = randomUUID();
    const actorId = randomUUID();
    const oldInvitationId = randomUUID();
    const oldOutboxId = randomUUID();
    const email = `initial-owner-${randomUUID()}@example.test`;
    await prisma.identity.create({
      data: {
        id: actorId,
        email: `${actorId}@example.test`,
        normalizedEmail: `${actorId}@example.test`,
      },
    });
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: `Provisioning ${organizationId}`,
        accessStatus: 'PROVISIONING',
      },
    });
    await prisma.invitation.create({
      data: {
        id: oldInvitationId,
        organizationId,
        email,
        normalizedEmail: email,
        tokenHash: hashInvitationToken(`old-${randomUUID()}`),
        kind: 'INITIAL_OWNER',
        targetProfile: 'Administrator',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.outboxMessage.create({
      data: {
        id: oldOutboxId,
        organizationId,
        recipient: email,
        template: 'INITIAL_OWNER_INVITATION_V1',
        deliveryKey: randomUUID(),
        encryptedEnvelope: 'old-sensitive-envelope',
      },
    });

    try {
      const notifications = {
        enqueueInitialOwnerInvitation: vi.fn(
          async (
            tx: Prisma.TransactionClient,
            params: { organizationId: string; recipient: string },
          ) =>
            tx.outboxMessage.create({
              data: {
                organizationId: params.organizationId,
                recipient: params.recipient,
                template: 'INITIAL_OWNER_INVITATION_V1',
                deliveryKey: randomUUID(),
                encryptedEnvelope: 'replacement-envelope',
              },
              select: { id: true },
            }),
        ),
        deliver: vi.fn(),
      };
      const service = new OrganizationService(prisma as never, notifications as never);
      const request = {
        organizationId,
        actorId,
        expectedVersion: 1,
        reason: 'Replace the initial owner link',
        confirmed: true,
      };

      const outcomes = await Promise.allSettled([
        service.resendInitialOwnerInvitation(request),
        service.resendInitialOwnerInvitation(request),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
      await expect(
        prisma.organization.findUnique({
          where: { id: organizationId },
          select: { version: true },
        }),
      ).resolves.toEqual({ version: 2 });
      await expect(
        prisma.invitation.findUnique({
          where: { id: oldInvitationId },
          select: { revokedAt: true },
        }),
      ).resolves.toEqual({ revokedAt: expect.any(Date) });
      await expect(
        prisma.invitation.count({
          where: { organizationId, consumedAt: null, revokedAt: null },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.outboxMessage.findUnique({
          where: { id: oldOutboxId },
          select: { status: true, encryptedEnvelope: true, lastFailureCode: true },
        }),
      ).resolves.toEqual({
        status: 'EXPIRED',
        encryptedEnvelope: '',
        lastFailureCode: 'CREDENTIAL_REPLACED',
      });
      await expect(
        prisma.auditEvidence.count({
          where: { organizationId, action: 'INITIAL_OWNER_INVITATION_RESENT' },
        }),
      ).resolves.toBe(1);
      expect(notifications.deliver).toHaveBeenCalledTimes(1);
    } finally {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.identity.deleteMany({ where: { id: actorId } });
    }
  });
});

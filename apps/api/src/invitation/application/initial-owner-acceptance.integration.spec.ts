import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashInvitationToken } from '../domain/invitation';
import { InitialOwnerAcceptanceService } from './initial-owner-acceptance.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

describe('InitialOwnerAcceptanceService concurrency', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('creates exactly one owner and activates the Organization once', async () => {
    const organizationId = randomUUID();
    const token = `initial-owner-${randomUUID()}`;
    const normalizedEmail = `owner-${randomUUID()}@example.test`;
    const invitationId = randomUUID();

    await prisma.organization.create({
      data: {
        id: organizationId,
        name: 'Concurrent owner acceptance test',
        accessStatus: 'PROVISIONING',
        commercialStatus: 'DEMO',
      },
    });
    await prisma.invitation.create({
      data: {
        id: invitationId,
        organizationId,
        email: normalizedEmail,
        normalizedEmail,
        tokenHash: hashInvitationToken(token),
        kind: 'INITIAL_OWNER',
        targetProfile: 'Administrator',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    try {
      const service = new InitialOwnerAcceptanceService(prisma as never);
      const outcomes = await Promise.all([
        service.accept({ token, password: 'Concurrent owner password 2026' }),
        service.accept({ token, password: 'Concurrent owner password 2026' }),
      ]);

      expect(outcomes.filter(Boolean)).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome === null)).toHaveLength(1);
      await expect(prisma.organizationOwnership.count({ where: { organizationId } })).resolves.toBe(
        1,
      );
      await expect(
        prisma.membership.count({ where: { organizationId, profile: 'Administrator' } }),
      ).resolves.toBe(1);
      await expect(
        prisma.organization.findUnique({
          where: { id: organizationId },
          select: { accessStatus: true },
        }),
      ).resolves.toEqual({ accessStatus: 'ACTIVE' });
    } finally {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.identity.deleteMany({ where: { normalizedEmail } });
    }
  });
});

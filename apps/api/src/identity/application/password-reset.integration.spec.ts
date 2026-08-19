import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../domain/password';
import { hashPasswordResetToken } from '../domain/password-reset';
import { PasswordResetRepository } from '../infrastructure/password-reset.repository';
import { PasswordResetService } from './password-reset.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

describe('PasswordResetService concurrency', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('resets a password exactly once and revokes existing sessions', async () => {
    const identityId = randomUUID();
    const token = `password-reset-${randomUUID()}`;
    const normalizedEmail = `password-reset-${randomUUID()}@example.test`;
    const oldPassword = 'Old password for reset 2026';
    const newPassword = 'New password for reset 2026';

    await prisma.identity.create({
      data: {
        id: identityId,
        email: normalizedEmail,
        normalizedEmail,
        passwordCredential: {
          create: { passwordHash: await hashPassword(oldPassword) },
        },
        authSessions: {
          create: {
            tokenHash: `session-${randomUUID()}`,
            expiresAt: new Date(Date.now() + 60_000),
            absoluteExpiresAt: new Date(Date.now() + 60_000),
          },
        },
        passwordResetTokens: {
          create: {
            tokenHash: hashPasswordResetToken(token),
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
    });

    try {
      const service = new PasswordResetService(new PasswordResetRepository(prisma as never));
      const outcomes = await Promise.all([
        service.resetPassword(token, newPassword),
        service.resetPassword(token, newPassword),
      ]);

      expect(outcomes.sort()).toEqual([false, true]);

      const identity = await prisma.identity.findUniqueOrThrow({
        where: { id: identityId },
        include: { passwordCredential: true, authSessions: true, passwordResetTokens: true },
      });
      expect(await verifyPassword(newPassword, identity.passwordCredential!.passwordHash)).toBe(
        true,
      );
      expect(identity.authSessions[0]?.revokedAt).toBeInstanceOf(Date);
      expect(identity.passwordResetTokens[0]?.consumedAt).toBeInstanceOf(Date);
    } finally {
      await prisma.identity.deleteMany({ where: { id: identityId } });
    }
  });
});

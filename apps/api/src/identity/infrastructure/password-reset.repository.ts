import { PrismaService } from '../../prisma/prisma.service';

export class PasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(identityId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.passwordResetToken.create({
      data: {
        identityId,
        tokenHash,
        expiresAt,
      },
    });
  }

  async findValidToken(tokenHash: string, now: Date) {
    return this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        expiresAt: {
          gt: now,
        },
        consumedAt: null,
        invalidatedAt: null,
      },
    });
  }

  async consume(id: string): Promise<void> {
    await this.prisma.passwordResetToken.update({
      where: { id },
      data: {
        consumedAt: new Date(),
      },
    });
  }

  async invalidateForIdentity(identityId: string): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: {
        identityId,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: {
        invalidatedAt: new Date(),
      },
    });
  }

  async updatePassword(identityId: string, passwordHash: string): Promise<void> {
    await this.prisma.passwordCredential.update({
      where: { identityId },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });
  }

  async revokeSessions(identityId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { identityId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async resetPassword(tokenHash: string, passwordHash: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          identityId: true,
          expiresAt: true,
          consumedAt: true,
          invalidatedAt: true,
        },
      });

      if (
        !token ||
        token.expiresAt <= now ||
        token.consumedAt !== null ||
        token.invalidatedAt !== null
      ) {
        return false;
      }

      const claimed = await tx.passwordResetToken.updateMany({
        where: {
          id: token.id,
          expiresAt: { gt: now },
          consumedAt: null,
          invalidatedAt: null,
        },
        data: { consumedAt: now },
      });

      if (claimed.count !== 1) return false;

      await tx.passwordCredential.update({
        where: { identityId: token.identityId },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.authSession.updateMany({
        where: { identityId: token.identityId, revokedAt: null },
        data: { revokedAt: now },
      });

      return true;
    });
  }
}

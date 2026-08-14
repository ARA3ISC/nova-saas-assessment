import { PrismaService } from '../../prisma/prisma.service';

export class PasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    identityId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
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
}

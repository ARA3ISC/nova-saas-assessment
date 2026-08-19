import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { hashSessionToken } from '../domain/session';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(params: {
    identityId: string;
    token: string;
    expiresAt: Date;
    absoluteExpiresAt: Date;
    recentAuthenticatedAt?: Date;
  }) {
    return this.prisma.authSession.create({
      data: {
        identityId: params.identityId,
        tokenHash: hashSessionToken(params.token),
        expiresAt: params.expiresAt,
        absoluteExpiresAt: params.absoluteExpiresAt,
        ...(params.recentAuthenticatedAt
          ? { recentAuthenticatedAt: params.recentAuthenticatedAt }
          : {}),
      },
    });
  }

  async findValidSession(token: string) {
    const tokenHash = hashSessionToken(token);
    const now = new Date();
    const session = await this.prisma.authSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
        absoluteExpiresAt: {
          gt: now,
        },
      },
      include: {
        identity: { select: { passwordCredential: { select: { mustChangePassword: true } } } },
      },
    });
    if (!session) return null;
    const expiresAt = new Date(
      Math.min(now.getTime() + 30 * 60 * 1000, session.absoluteExpiresAt.getTime()),
    );
    const renewed = await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
        revokedAt: null,
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
      },
      data: { lastSeenAt: now, expiresAt },
    });
    if (renewed.count !== 1) return null;
    return { ...session, lastSeenAt: now, expiresAt };
  }

  async completeRequiredPasswordChange(identityId: string, passwordHash: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.passwordCredential.updateMany({
        where: { identityId, mustChangePassword: true },
        data: { passwordHash, mustChangePassword: false },
      });
      if (changed.count !== 1) return false;
      await tx.authSession.updateMany({
        where: { identityId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return true;
    });
  }

  async revokeSession(token: string) {
    const tokenHash = hashSessionToken(token);

    return this.prisma.authSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async findIdentityByEmail(normalizedEmail: string) {
    return this.prisma.identity.findUnique({
      where: {
        normalizedEmail,
      },
      include: {
        passwordCredential: true,
      },
    });
  }

  async findIdentityContext(identityId: string) {
    return this.prisma.identity.findUnique({
      where: { id: identityId },
      select: {
        id: true,
        email: true,
        passwordCredential: { select: { mustChangePassword: true } },
        membership: {
          select: {
            profile: true,
            status: true,
            organization: { select: { id: true, name: true, accessStatus: true } },
          },
        },
        platformPrincipal: { select: { id: true } },
      },
    });
  }
}

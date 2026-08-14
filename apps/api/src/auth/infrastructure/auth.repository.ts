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

    return this.prisma.authSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
        absoluteExpiresAt: {
          gt: new Date(),
        },
      },
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
}

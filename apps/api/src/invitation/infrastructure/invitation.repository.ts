import { Injectable } from '@nestjs/common';
import {
  InvitationKind as PrismaInvitationKind,
  OrganizationProfile,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InvitationRepository {
  constructor(
    private readonly prisma: PrismaService,
  ) { }

  async create(params: {
    organizationId: string;
    email: string;
    normalizedEmail: string;
    tokenHash: string;
    kind: PrismaInvitationKind;
    targetProfile: OrganizationProfile;
    expiresAt: Date;
  }) {
    return this.prisma.invitation.create({
      data: {
        organizationId: params.organizationId,
        email: params.email,
        normalizedEmail: params.normalizedEmail,
        tokenHash: params.tokenHash,
        kind: params.kind,
        targetProfile: params.targetProfile,
        expiresAt: params.expiresAt,
      },
    });
  }

  async findValidToken(
    tokenHash: string,
    now: Date,
  ) {
    return this.prisma.invitation.findFirst({
      where: {
        tokenHash,
        expiresAt: {
          gt: now,
        },
        consumedAt: null,
        revokedAt: null,
      },
    });
  }

  async findByOrganizationEmailAndKind(params: {
    organizationId: string;
    normalizedEmail: string;
    kind: PrismaInvitationKind;
  }) {
    return this.prisma.invitation.findFirst({
      where: {
        organizationId: params.organizationId,
        normalizedEmail: params.normalizedEmail,
        kind: params.kind,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async consume(id: string): Promise<void> {
    await this.prisma.invitation.update({
      where: { id },
      data: {
        consumedAt: new Date(),
      },
    });
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.invitation.update({
      where: { id },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async revokePendingForOrganizationEmailAndKind(
    params: {
      organizationId: string;
      normalizedEmail: string;
      kind: PrismaInvitationKind;
    },
  ): Promise<void> {
    await this.prisma.invitation.updateMany({
      where: {
        organizationId: params.organizationId,
        normalizedEmail: params.normalizedEmail,
        kind: params.kind,
        consumedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}

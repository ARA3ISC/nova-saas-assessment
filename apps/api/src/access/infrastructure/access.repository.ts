import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AccessRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findEffectiveAccess(identityId: string) {
    return this.prisma.membership.findUnique({
      where: {
        identityId,
      },
      include: {
        identity: {
          select: {
            id: true,
            status: true,
          },
        },
        organization: {
          select: {
            id: true,
            accessStatus: true,
          },
        },
      },
    });
  }
}

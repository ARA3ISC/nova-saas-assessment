import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlatformRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPlatformPrincipalByIdentity(identityId: string) {
    return this.prisma.platformPrincipal.findUnique({
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
      },
    });
  }
}

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AccessRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findEffectiveAccess(identityId: string) {
    const membership = await this.prisma.membership.findUnique({
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
        capabilityGrants: { select: { capability: true } },
        companyGrants: {
          select: { companyId: true, company: { select: { status: true } } },
        },
        businessScopeGrants: {
          select: {
            businessScopeId: true,
            businessScope: {
              select: { status: true, company: { select: { status: true } } },
            },
          },
        },
      },
    });
    if (!membership) return null;
    const activeDefinitions = await this.prisma.capabilityDefinition.findMany({
      where: {
        key: { in: membership.capabilityGrants.map((grant) => grant.capability) },
        active: true,
        platformOnly: false,
      },
      select: { key: true },
    });
    const activeCapabilities = new Set(activeDefinitions.map((definition) => definition.key));
    return {
      ...membership,
      capabilityGrants: membership.capabilityGrants.filter((grant) =>
        activeCapabilities.has(grant.capability),
      ),
      companyGrants: membership.companyGrants.filter((grant) => grant.company.status === 'ACTIVE'),
      businessScopeGrants: membership.businessScopeGrants.filter(
        (grant) =>
          grant.businessScope.status === 'ACTIVE' &&
          grant.businessScope.company.status === 'ACTIVE',
      ),
    };
  }
}

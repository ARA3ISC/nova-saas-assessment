import { ForbiddenException, Injectable } from '@nestjs/common';

import { AccessRepository } from '../infrastructure/access.repository';

export type EffectiveAccess = {
  identityId: string;
  organizationId: string;
  membershipId: string;
  profile: 'Administrator' | 'User';
  accessEpoch: number;
  capabilities?: string[];
  companyIds?: string[];
  businessScopeIds?: string[];
  organizationWideAccess?: boolean;
};

@Injectable()
export class AccessService {
  constructor(private readonly repository: AccessRepository) {}

  async resolveEffectiveAccess(identityId: string): Promise<EffectiveAccess> {
    if (!identityId) {
      throw new ForbiddenException('Access denied');
    }

    const membership = await this.repository.findEffectiveAccess(identityId);

    if (!membership) {
      throw new ForbiddenException('Access denied');
    }

    if (membership.identity.status !== 'ACTIVE') {
      throw new ForbiddenException('Access denied');
    }

    if (membership.status !== 'ACTIVE') {
      throw new ForbiddenException('Access denied');
    }

    if (membership.organization.accessStatus !== 'ACTIVE') {
      throw new ForbiddenException('Access denied');
    }

    return {
      identityId: membership.identityId,
      organizationId: membership.organizationId,
      membershipId: membership.id,
      profile: membership.profile,
      accessEpoch: membership.accessEpoch,
      organizationWideAccess: Boolean(membership.organizationWideAccess),
      capabilities: (membership.capabilityGrants ?? []).map((grant) => grant.capability),
      companyIds: (membership.companyGrants ?? []).map((grant) => grant.companyId),
      businessScopeIds: (membership.businessScopeGrants ?? []).map(
        (grant) => grant.businessScopeId,
      ),
    };
  }
}

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { EffectiveAccess } from './access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTenantContext } from '../../prisma/tenant-transaction';
import { ALLOWED_CAPABILITIES } from '../domain/permission-presets';
import { PermissionPresetService } from './permission-preset.service';

@Injectable()
export class CollaboratorLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presets: PermissionPresetService,
  ) {}

  async list(access: EffectiveAccess) {
    if (access.profile !== 'Administrator') throw new ForbiddenException('Access denied');
    return withTenantContext(
      this.prisma,
      {
        organizationId: access.organizationId,
        actorId: access.identityId,
        accessEpoch: access.accessEpoch,
        membershipId: access.membershipId,
      },
      (tx) =>
        tx.membership.findMany({
          orderBy: { identity: { email: 'asc' } },
          take: 100,
          select: {
            id: true,
            profile: true,
            status: true,
            version: true,
            accessEpoch: true,
            organizationWideAccess: true,
            identity: { select: { email: true } },
            ownership: { select: { id: true } },
            capabilityGrants: { select: { capability: true } },
            companyGrants: { select: { companyId: true } },
            businessScopeGrants: { select: { businessScopeId: true } },
          },
        }),
    );
  }

  async suspend(access: EffectiveAccess, membershipId: string, reason: string, confirmed: boolean) {
    return this.change(access, membershipId, 'SUSPENDED', reason, confirmed);
  }
  async reactivate(
    access: EffectiveAccess,
    membershipId: string,
    reason: string,
    confirmed: boolean,
  ) {
    return this.change(access, membershipId, 'ACTIVE', reason, confirmed);
  }
  async remove(access: EffectiveAccess, membershipId: string, reason: string, confirmed: boolean) {
    return this.change(access, membershipId, 'REMOVED', reason, confirmed);
  }

  async replaceGrants(
    access: EffectiveAccess,
    membershipId: string,
    params: {
      capabilities: string[];
      companyIds: string[];
      businessScopeIds: string[];
      organizationWideAccess: boolean;
      expectedVersion: number;
      presetId?: string;
      reason: string;
      confirmed: boolean;
    },
  ) {
    this.requireConfirmation(params.reason, params.confirmed);
    if (access.profile !== 'Administrator') throw new ForbiddenException('Access denied');
    if (!Number.isInteger(params.expectedVersion) || params.expectedVersion < 1)
      throw new ConflictException('A valid collaborator version is required');
    return withTenantContext(
      this.prisma,
      {
        organizationId: access.organizationId,
        actorId: access.identityId,
        accessEpoch: access.accessEpoch,
        membershipId: access.membershipId,
      },
      async (tx) => {
        // Presets are validated starting points. The caller submits the final
        // adjusted explicit grants, including any removals from that preset.
        if (params.presetId) await this.presets.resolve(tx, params.presetId);
        const capabilities = [...new Set(params.capabilities)];
        if (capabilities.some((capability) => !ALLOWED_CAPABILITIES.has(capability)))
          throw new ConflictException('Unknown capability');
        const membership = await tx.membership.findFirst({
          where: { id: membershipId, status: 'ACTIVE' },
          select: {
            id: true,
            identityId: true,
            version: true,
            organizationWideAccess: true,
            ownership: { select: { id: true } },
            capabilityGrants: { select: { capability: true } },
            companyGrants: { select: { companyId: true } },
            businessScopeGrants: { select: { businessScopeId: true } },
          },
        });
        if (!membership || membership.ownership)
          throw new ConflictException('Eligible collaborator not found');
        const companyIds = [...new Set(params.companyIds)];
        const businessScopeIds = [...new Set(params.businessScopeIds)];
        const [companyCount, businessScopeCount] = await Promise.all([
          tx.company.count({ where: { id: { in: companyIds }, status: 'ACTIVE' } }),
          tx.businessScope.count({ where: { id: { in: businessScopeIds }, status: 'ACTIVE' } }),
        ]);
        if (companyCount !== companyIds.length || businessScopeCount !== businessScopeIds.length)
          throw new ConflictException('Unknown or inactive scope grant');
        const claimed = await tx.membership.updateMany({
          where: { id: membershipId, version: params.expectedVersion },
          data: {
            accessEpoch: { increment: 1 },
            version: { increment: 1 },
            organizationWideAccess: params.organizationWideAccess,
          },
        });
        if (claimed.count !== 1)
          throw new ConflictException('Collaborator access changed; refresh and retry');
        await tx.capabilityGrant.deleteMany({ where: { membershipId } });
        await tx.companyGrant.deleteMany({ where: { membershipId } });
        await tx.businessScopeGrant.deleteMany({ where: { membershipId } });
        if (capabilities.length)
          await tx.capabilityGrant.createMany({
            data: capabilities.map((capability) => ({
              organizationId: access.organizationId,
              membershipId,
              capability,
            })),
          });
        if (companyIds.length)
          await tx.companyGrant.createMany({
            data: companyIds.map((companyId) => ({
              organizationId: access.organizationId,
              membershipId,
              companyId,
            })),
          });
        if (businessScopeIds.length)
          await tx.businessScopeGrant.createMany({
            data: businessScopeIds.map((businessScopeId) => ({
              organizationId: access.organizationId,
              membershipId,
              businessScopeId,
            })),
          });
        const now = new Date();
        await tx.authSession.updateMany({
          where: { identityId: membership.identityId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.auditEvidence.create({
          data: {
            organizationId: access.organizationId,
            actorId: access.identityId,
            action: 'COLLABORATOR_GRANTS_REPLACED',
            reason: params.reason.trim(),
            subjectType: 'Membership',
            subjectId: membershipId,
            before: {
              version: membership.version,
              capabilities: membership.capabilityGrants.map((grant) => grant.capability),
              companyIds: membership.companyGrants.map((grant) => grant.companyId),
              businessScopeIds: membership.businessScopeGrants.map(
                (grant) => grant.businessScopeId,
              ),
              organizationWideAccess: membership.organizationWideAccess,
            },
            after: {
              version: membership.version + 1,
              capabilities,
              companyIds,
              businessScopeIds,
              organizationWideAccess: params.organizationWideAccess,
              presetId: params.presetId ?? null,
            },
          },
        });
        return {
          membershipId,
          capabilities,
          companyIds,
          businessScopeIds,
          organizationWideAccess: params.organizationWideAccess,
          version: membership.version + 1,
        };
      },
    );
  }

  private async change(
    access: EffectiveAccess,
    membershipId: string,
    status: MembershipStatus,
    reason: string,
    confirmed: boolean,
  ) {
    this.requireConfirmation(reason, confirmed);
    if (access.profile !== 'Administrator') throw new ForbiddenException('Access denied');
    return withTenantContext(
      this.prisma,
      {
        organizationId: access.organizationId,
        actorId: access.identityId,
        accessEpoch: access.accessEpoch,
        membershipId: access.membershipId,
      },
      async (tx) => {
        const membership = await tx.membership.findFirst({
          where: { id: membershipId },
          select: {
            id: true,
            identityId: true,
            status: true,
            version: true,
            ownership: { select: { id: true } },
          },
        });
        if (!membership) throw new NotFoundException('Collaborator not found');
        if (membership.ownership)
          throw new ConflictException('Transfer ownership before changing the owner');
        if (membership.status === status) return { id: membership.id, status: membership.status };
        const allowed =
          (membership.status === 'ACTIVE' && (status === 'SUSPENDED' || status === 'REMOVED')) ||
          (membership.status === 'SUSPENDED' && (status === 'ACTIVE' || status === 'REMOVED'));
        if (!allowed) {
          throw new ConflictException(
            membership.status === 'REMOVED'
              ? 'Removed collaborators must return through a new invitation'
              : 'Invalid collaborator lifecycle transition',
          );
        }
        const now = new Date();
        const claimed = await tx.membership.updateMany({
          where: { id: membership.id, status: membership.status, version: membership.version },
          data: {
            status,
            accessEpoch: { increment: 1 },
            version: { increment: 1 },
            suspendedAt: status === 'SUSPENDED' ? now : null,
            removedAt: status === 'REMOVED' ? now : null,
          },
        });
        if (claimed.count !== 1)
          throw new ConflictException('Collaborator lifecycle changed; refresh and retry');
        if (status !== 'ACTIVE')
          await tx.ownershipTransferProposal.updateMany({
            where: { successorMembershipId: membership.id, status: 'PENDING' },
            data: { status: 'CANCELLED', cancelledAt: now },
          });
        await tx.authSession.updateMany({
          where: { identityId: membership.identityId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.auditEvidence.create({
          data: {
            organizationId: access.organizationId,
            actorId: access.identityId,
            action: `COLLABORATOR_${status}`,
            reason: reason.trim(),
            subjectType: 'Membership',
            subjectId: membership.id,
            before: { status: membership.status, version: membership.version },
            after: { status, version: membership.version + 1 },
          },
        });
        return { id: membership.id, status, version: membership.version + 1 };
      },
    );
  }
  private requireConfirmation(reason: string, confirmed: boolean) {
    if (!confirmed || !reason.trim())
      throw new ConflictException('A reason and explicit confirmation are required');
  }
}

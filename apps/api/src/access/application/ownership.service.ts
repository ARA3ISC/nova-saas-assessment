import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EffectiveAccess } from './access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTenantContext } from '../../prisma/tenant-transaction';

@Injectable()
export class OwnershipService {
  constructor(private readonly prisma: PrismaService) {}
  async listPending(access: EffectiveAccess) {
    return this.inTenant(access, async (tx) => {
      const proposals = await tx.ownershipTransferProposal.findMany({
        where: {
          status: 'PENDING',
          expiresAt: { gt: new Date() },
          successorMembershipId: access.membershipId,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          proposerMembershipId: true,
          successorMembershipId: true,
          expiresAt: true,
          createdAt: true,
        },
      });
      const proposers = await tx.membership.findMany({
        where: { id: { in: proposals.map((proposal) => proposal.proposerMembershipId) } },
        select: { id: true, identity: { select: { email: true } } },
      });
      const proposerEmails = new Map(
        proposers.map((membership) => [membership.id, membership.identity.email]),
      );
      return proposals.map((proposal) => ({
        ...proposal,
        proposerEmail: proposerEmails.get(proposal.proposerMembershipId) ?? 'Former owner',
      }));
    });
  }
  async promote(access: EffectiveAccess, membershipId: string, reason: string, confirmed: boolean) {
    this.requireConfirmation(reason, confirmed);
    return this.inTenant(access, async (tx) => {
      await this.requireOwner(tx, access.membershipId);
      const target = await tx.membership.findFirst({
        where: { id: membershipId, status: 'ACTIVE', profile: 'User' },
        select: { id: true, identityId: true, profile: true, version: true },
      });
      if (!target) throw new ConflictException('Eligible User not found');
      const claimed = await tx.membership.updateMany({
        where: { id: target.id, status: 'ACTIVE', profile: 'User', version: target.version },
        data: {
          profile: 'Administrator',
          accessEpoch: { increment: 1 },
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException('Collaborator changed; refresh and retry');
      await tx.authSession.updateMany({
        where: { identityId: target.identityId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditEvidence.create({
        data: {
          organizationId: access.organizationId,
          actorId: access.identityId,
          action: 'COLLABORATOR_PROMOTED',
          reason: reason.trim(),
          subjectType: 'Membership',
          subjectId: target.id,
          before: { profile: target.profile, version: target.version },
          after: { profile: 'Administrator', version: target.version + 1 },
        },
      });
      return { id: target.id, profile: 'Administrator' as const, version: target.version + 1 };
    });
  }
  async demote(access: EffectiveAccess, membershipId: string, reason: string, confirmed: boolean) {
    this.requireConfirmation(reason, confirmed);
    return this.inTenant(access, async (tx) => {
      await this.requireOwner(tx, access.membershipId);
      const target = await tx.membership.findFirst({
        where: { id: membershipId, status: 'ACTIVE', profile: 'Administrator' },
        select: {
          id: true,
          identityId: true,
          profile: true,
          version: true,
          ownership: { select: { id: true } },
        },
      });
      if (!target || target.ownership)
        throw new ConflictException('Eligible non-owner Administrator not found');

      const now = new Date();
      const claimed = await tx.membership.updateMany({
        where: {
          id: target.id,
          status: 'ACTIVE',
          profile: 'Administrator',
          version: target.version,
        },
        data: {
          profile: 'User',
          accessEpoch: { increment: 1 },
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException('Collaborator changed; refresh and retry');
      await tx.ownershipTransferProposal.updateMany({
        where: { successorMembershipId: target.id, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      await tx.authSession.updateMany({
        where: { identityId: target.identityId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.auditEvidence.create({
        data: {
          organizationId: access.organizationId,
          actorId: access.identityId,
          action: 'COLLABORATOR_DEMOTED',
          reason: reason.trim(),
          subjectType: 'Membership',
          subjectId: target.id,
          before: { profile: target.profile, version: target.version },
          after: { profile: 'User', version: target.version + 1 },
        },
      });
      return { id: target.id, profile: 'User' as const, version: target.version + 1 };
    });
  }
  async propose(
    access: EffectiveAccess,
    successorMembershipId: string,
    reason: string,
    confirmed: boolean,
  ) {
    this.requireConfirmation(reason, confirmed);
    return this.inTenant(access, async (tx) => {
      await this.requireOwner(tx, access.membershipId);
      const successor = await tx.membership.findFirst({
        where: { id: successorMembershipId, status: 'ACTIVE', profile: 'Administrator' },
        select: { id: true },
      });
      if (!successor || successor.id === access.membershipId)
        throw new ConflictException('Eligible Administrator not found');
      await tx.ownershipTransferProposal.updateMany({
        where: { status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      let proposal: { id: string };
      try {
        proposal = await tx.ownershipTransferProposal.create({
          data: {
            organizationId: access.organizationId,
            proposerMembershipId: access.membershipId,
            successorMembershipId: successor.id,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Another ownership transfer is already pending');
        }
        throw error;
      }
      await tx.auditEvidence.create({
        data: {
          organizationId: access.organizationId,
          actorId: access.identityId,
          action: 'OWNERSHIP_TRANSFER_PROPOSED',
          reason: reason.trim(),
          subjectType: 'OwnershipTransferProposal',
          subjectId: proposal.id,
          before: {},
          after: { successorMembershipId: successor.id },
        },
      });
      return proposal;
    });
  }
  async accept(access: EffectiveAccess, proposalId: string, reason: string, confirmed: boolean) {
    this.requireConfirmation(reason, confirmed);
    return this.inTenant(
      access,
      async (tx) => {
        const now = new Date();
        const proposal = await tx.ownershipTransferProposal.findFirst({
          where: {
            id: proposalId,
            status: 'PENDING',
            successorMembershipId: access.membershipId,
            expiresAt: { gt: now },
          },
          select: { id: true, successorMembershipId: true, proposerMembershipId: true },
        });
        if (!proposal) throw new ConflictException('Ownership transfer is not available');
        const successor = await tx.membership.findFirst({
          where: { id: proposal.successorMembershipId, status: 'ACTIVE', profile: 'Administrator' },
          select: { id: true, identityId: true },
        });
        const owner = await tx.organizationOwnership.findUnique({
          where: { organizationId: access.organizationId },
          select: { membershipId: true },
        });
        if (!successor || !owner || owner.membershipId !== proposal.proposerMembershipId)
          throw new ConflictException('Ownership transfer is not available');
        const formerOwner = await tx.membership.findFirst({
          where: { id: proposal.proposerMembershipId, status: 'ACTIVE', profile: 'Administrator' },
          select: { id: true, identityId: true },
        });
        if (!formerOwner) throw new ConflictException('Ownership transfer is not available');
        const claim = await tx.ownershipTransferProposal.updateMany({
          where: {
            id: proposal.id,
            status: 'PENDING',
            successorMembershipId: access.membershipId,
            expiresAt: { gt: now },
          },
          data: { status: 'ACCEPTED', acceptedAt: now },
        });
        if (claim.count !== 1) throw new ConflictException('Ownership transfer is not available');
        const ownershipChange = await tx.organizationOwnership.updateMany({
          where: {
            organizationId: access.organizationId,
            membershipId: proposal.proposerMembershipId,
          },
          data: { membershipId: successor.id },
        });
        if (ownershipChange.count !== 1)
          throw new ConflictException('Ownership transfer is not available');
        await tx.membership.updateMany({
          where: { id: { in: [formerOwner.id, successor.id] } },
          data: { accessEpoch: { increment: 1 }, version: { increment: 1 } },
        });
        await tx.authSession.updateMany({
          where: {
            identityId: { in: [formerOwner.identityId, successor.identityId] },
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
        await tx.auditEvidence.create({
          data: {
            organizationId: access.organizationId,
            actorId: access.identityId,
            action: 'OWNERSHIP_TRANSFER_ACCEPTED',
            reason: reason.trim(),
            subjectType: 'OrganizationOwnership',
            subjectId: access.organizationId,
            before: { membershipId: owner.membershipId },
            after: { membershipId: successor.id },
          },
        });
        return { ownerMembershipId: successor.id };
      },
      access.accessEpoch + 1,
    );
  }
  private requireConfirmation(reason: string, confirmed: boolean) {
    if (!confirmed || !reason.trim())
      throw new ConflictException('A reason and explicit confirmation are required');
  }
  private async requireOwner(
    tx: Parameters<typeof withTenantContext>[2] extends (tx: infer T) => unknown ? T : never,
    membershipId: string,
  ) {
    const owner = await tx.organizationOwnership.findFirst({
      where: { membershipId },
      select: { id: true },
    });
    if (!owner) throw new ForbiddenException('Owner access required');
  }
  private inTenant<T>(
    access: EffectiveAccess,
    callback: Parameters<typeof withTenantContext<T>>[2],
    expectedFinalAccessEpoch?: number,
  ) {
    if (access.profile !== 'Administrator') throw new ForbiddenException('Access denied');
    return withTenantContext(
      this.prisma,
      {
        organizationId: access.organizationId,
        actorId: access.identityId,
        accessEpoch: access.accessEpoch,
        membershipId: access.membershipId,
        ...(expectedFinalAccessEpoch !== undefined ? { expectedFinalAccessEpoch } : {}),
      },
      callback,
    );
  }
}

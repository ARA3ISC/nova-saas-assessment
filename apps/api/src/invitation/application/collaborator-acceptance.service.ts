import { Injectable } from '@nestjs/common';
import { InvitationKind, OrganizationProfile, Prisma } from '@prisma/client';

import { hashPassword } from '../../identity/domain/password';
import { PrismaService } from '../../prisma/prisma.service';
import { hashInvitationToken } from '../domain/invitation';

@Injectable()
export class CollaboratorAcceptanceService {
  constructor(private readonly prisma: PrismaService) {}

  async accept(params: { token: string; password: string }): Promise<boolean> {
    const passwordHash = await hashPassword(params.password);
    const now = new Date();
    const tokenHash = hashInvitationToken(params.token);

    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findFirst({
        where: {
          tokenHash,
          kind: InvitationKind.COLLABORATOR,
          targetProfile: OrganizationProfile.User,
          expiresAt: { gt: now },
          consumedAt: null,
          revokedAt: null,
          organization: { accessStatus: 'ACTIVE' },
        },
        select: {
          id: true,
          organizationId: true,
          email: true,
          normalizedEmail: true,
          capabilities: true,
          companyIds: true,
          businessScopeIds: true,
          organizationWideAccess: true,
        },
      });
      if (!invitation) return false;

      const existingIdentity = await tx.identity.findUnique({
        where: { normalizedEmail: invitation.normalizedEmail },
        select: { id: true },
      });
      if (existingIdentity) return false;

      const consumption = await tx.invitation.updateMany({
        where: { id: invitation.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumption.count !== 1) return false;

      const identity = await tx.identity.create({
        data: {
          email: invitation.email,
          normalizedEmail: invitation.normalizedEmail,
          passwordCredential: { create: { passwordHash } },
        },
        select: { id: true },
      });
      const membership = await tx.membership.create({
        data: {
          organizationId: invitation.organizationId,
          identityId: identity.id,
          profile: OrganizationProfile.User,
          status: 'ACTIVE',
          organizationWideAccess: invitation.organizationWideAccess,
        },
        select: { id: true },
      });
      if (!(await this.applyCurrentGrants(tx, invitation, membership.id))) {
        throw new Error('Invitation grants are no longer valid');
      }
      await tx.auditEvidence.create({
        data: {
          organizationId: invitation.organizationId,
          actorId: identity.id,
          action: 'COLLABORATOR_INVITATION_ACCEPTED',
          reason: 'Mailbox-delivered collaborator invitation accepted',
          subjectType: 'Invitation',
          subjectId: invitation.id,
          before: {},
          after: { membershipId: membership.id, profile: OrganizationProfile.User },
        },
      });
      return true;
    });
  }

  async acceptExisting(identityId: string, token: string): Promise<boolean> {
    const now = new Date();
    const tokenHash = hashInvitationToken(token);
    return this.prisma.$transaction(async (tx) => {
      const invitation = await this.findValidInvitation(tx, tokenHash, now);
      if (!invitation) return false;
      const identity = await tx.identity.findFirst({
        where: { id: identityId, normalizedEmail: invitation.normalizedEmail, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!identity) return false;
      const existingMembership = await tx.membership.findUnique({
        where: { identityId: identity.id },
        select: { id: true, organizationId: true, status: true },
      });
      if (existingMembership && existingMembership.organizationId !== invitation.organizationId)
        return false;
      if (existingMembership?.status === 'ACTIVE') return false;
      const consumption = await tx.invitation.updateMany({
        where: { id: invitation.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumption.count !== 1) return false;
      const membership = existingMembership
        ? await tx.membership.update({
            where: { id: existingMembership.id },
            data: {
              status: 'ACTIVE',
              suspendedAt: null,
              removedAt: null,
              accessEpoch: { increment: 1 },
              version: { increment: 1 },
              organizationWideAccess: invitation.organizationWideAccess,
            },
            select: { id: true },
          })
        : await tx.membership.create({
            data: {
              organizationId: invitation.organizationId,
              identityId: identity.id,
              profile: OrganizationProfile.User,
              status: 'ACTIVE',
              organizationWideAccess: invitation.organizationWideAccess,
            },
            select: { id: true },
          });
      if (!(await this.applyCurrentGrants(tx, invitation, membership.id))) {
        throw new Error('Invitation grants are no longer valid');
      }
      await tx.auditEvidence.create({
        data: {
          organizationId: invitation.organizationId,
          actorId: identity.id,
          action: 'COLLABORATOR_INVITATION_ACCEPTED',
          reason: 'Authenticated existing identity accepted collaborator invitation',
          subjectType: 'Invitation',
          subjectId: invitation.id,
          before: { membershipStatus: existingMembership?.status ?? null },
          after: { membershipId: membership.id, membershipStatus: 'ACTIVE' },
        },
      });
      return true;
    });
  }

  private findValidInvitation(tx: Prisma.TransactionClient, tokenHash: string, now: Date) {
    return tx.invitation.findFirst({
      where: {
        tokenHash,
        kind: InvitationKind.COLLABORATOR,
        targetProfile: OrganizationProfile.User,
        expiresAt: { gt: now },
        consumedAt: null,
        revokedAt: null,
        organization: { accessStatus: 'ACTIVE' },
      },
      select: {
        id: true,
        organizationId: true,
        email: true,
        normalizedEmail: true,
        capabilities: true,
        companyIds: true,
        businessScopeIds: true,
        organizationWideAccess: true,
      },
    });
  }

  private async applyCurrentGrants(
    tx: Prisma.TransactionClient,
    invitation: {
      organizationId: string;
      capabilities: unknown;
      companyIds: unknown;
      businessScopeIds: unknown;
      organizationWideAccess: boolean;
    },
    membershipId: string,
  ): Promise<boolean> {
    const capabilities = Array.isArray(invitation.capabilities)
      ? invitation.capabilities.filter((value): value is string => typeof value === 'string')
      : [];
    const companyIds = Array.isArray(invitation.companyIds)
      ? invitation.companyIds.filter((value): value is string => typeof value === 'string')
      : [];
    const businessScopeIds = Array.isArray(invitation.businessScopeIds)
      ? invitation.businessScopeIds.filter((value): value is string => typeof value === 'string')
      : [];
    const [validCapabilities, validCompanies, validScopes] = await Promise.all([
      tx.capabilityDefinition.count({
        where: { key: { in: capabilities }, active: true, platformOnly: false },
      }),
      tx.company.count({
        where: {
          id: { in: companyIds },
          organizationId: invitation.organizationId,
          status: 'ACTIVE',
        },
      }),
      tx.businessScope.count({
        where: {
          id: { in: businessScopeIds },
          organizationId: invitation.organizationId,
          status: 'ACTIVE',
        },
      }),
    ]);
    if (
      validCapabilities !== capabilities.length ||
      validCompanies !== companyIds.length ||
      validScopes !== businessScopeIds.length
    )
      return false;
    await tx.capabilityGrant.deleteMany({ where: { membershipId } });
    await tx.companyGrant.deleteMany({ where: { membershipId } });
    await tx.businessScopeGrant.deleteMany({ where: { membershipId } });
    if (capabilities.length)
      await tx.capabilityGrant.createMany({
        data: capabilities.map((capability) => ({
          organizationId: invitation.organizationId,
          membershipId,
          capability,
        })),
      });
    if (companyIds.length)
      await tx.companyGrant.createMany({
        data: companyIds.map((companyId) => ({
          organizationId: invitation.organizationId,
          membershipId,
          companyId,
        })),
      });
    if (businessScopeIds.length)
      await tx.businessScopeGrant.createMany({
        data: businessScopeIds.map((businessScopeId) => ({
          organizationId: invitation.organizationId,
          membershipId,
          businessScopeId,
        })),
      });
    return true;
  }
}

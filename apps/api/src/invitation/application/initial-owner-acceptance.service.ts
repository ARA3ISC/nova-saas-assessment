import { Injectable } from '@nestjs/common';
import { InvitationKind, OrganizationAccessStatus, OrganizationProfile } from '@prisma/client';

import { hashPassword } from '../../identity/domain/password';
import { PrismaService } from '../../prisma/prisma.service';
import { hashInvitationToken } from '../domain/invitation';

@Injectable()
export class InitialOwnerAcceptanceService {
  constructor(private readonly prisma: PrismaService) {}

  async accept(params: {
    token: string;
    password: string;
  }): Promise<{ organizationId: string } | null> {
    const passwordHash = await hashPassword(params.password);
    const tokenHash = hashInvitationToken(params.token);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findFirst({
        where: {
          tokenHash,
          kind: InvitationKind.INITIAL_OWNER,
          targetProfile: OrganizationProfile.Administrator,
          expiresAt: { gt: now },
          consumedAt: null,
          revokedAt: null,
        },
        select: {
          id: true,
          organizationId: true,
          email: true,
          normalizedEmail: true,
        },
      });

      if (!invitation) {
        return null;
      }

      const organization = await tx.organization.findFirst({
        where: {
          id: invitation.organizationId,
          accessStatus: OrganizationAccessStatus.PROVISIONING,
        },
        select: { id: true },
      });

      if (!organization) {
        return null;
      }

      // Existing identities must authenticate before accepting an invitation;
      // this unauthenticated account-creation route cannot attach one.
      const existingIdentity = await tx.identity.findUnique({
        where: { normalizedEmail: invitation.normalizedEmail },
        select: { id: true },
      });

      if (existingIdentity) {
        return null;
      }

      const consumption = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });

      if (consumption.count !== 1) {
        return null;
      }

      const identity = await tx.identity.create({
        data: {
          email: invitation.email,
          normalizedEmail: invitation.normalizedEmail,
          passwordCredential: {
            create: { passwordHash },
          },
        },
        select: { id: true },
      });

      const membership = await tx.membership.create({
        data: {
          organizationId: organization.id,
          identityId: identity.id,
          profile: OrganizationProfile.Administrator,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      await tx.organizationOwnership.create({
        data: {
          organizationId: organization.id,
          membershipId: membership.id,
        },
      });

      const activation = await tx.organization.updateMany({
        where: {
          id: organization.id,
          accessStatus: OrganizationAccessStatus.PROVISIONING,
        },
        data: { accessStatus: OrganizationAccessStatus.ACTIVE },
      });

      if (activation.count !== 1) {
        throw new Error('Organization activation conflict');
      }

      await tx.auditEvidence.create({
        data: {
          organizationId: organization.id,
          actorId: identity.id,
          action: 'INITIAL_OWNER_INVITATION_ACCEPTED',
          reason: 'Mailbox-delivered initial-owner invitation accepted',
          subjectType: 'Invitation',
          subjectId: invitation.id,
          before: { accessStatus: OrganizationAccessStatus.PROVISIONING },
          after: {
            accessStatus: OrganizationAccessStatus.ACTIVE,
            ownerMembershipId: membership.id,
          },
        },
      });

      return { organizationId: organization.id };
    });
  }

  async acceptExisting(
    identityId: string,
    token: string,
  ): Promise<{ organizationId: string } | null> {
    const tokenHash = hashInvitationToken(token);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findFirst({
        where: {
          tokenHash,
          kind: InvitationKind.INITIAL_OWNER,
          targetProfile: OrganizationProfile.Administrator,
          expiresAt: { gt: now },
          consumedAt: null,
          revokedAt: null,
        },
        select: { id: true, organizationId: true, normalizedEmail: true },
      });
      if (!invitation) return null;
      const organization = await tx.organization.findFirst({
        where: {
          id: invitation.organizationId,
          accessStatus: OrganizationAccessStatus.PROVISIONING,
        },
        select: { id: true },
      });
      if (!organization) return null;
      const identity = await tx.identity.findFirst({
        where: { id: identityId, normalizedEmail: invitation.normalizedEmail, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!identity) return null;
      const priorMembership = await tx.membership.findUnique({
        where: { identityId: identity.id },
        select: { id: true },
      });
      if (priorMembership) return null;
      const consumption = await tx.invitation.updateMany({
        where: { id: invitation.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumption.count !== 1) return null;
      const membership = await tx.membership.create({
        data: {
          organizationId: organization.id,
          identityId: identity.id,
          profile: OrganizationProfile.Administrator,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      await tx.organizationOwnership.create({
        data: { organizationId: organization.id, membershipId: membership.id },
      });
      const activation = await tx.organization.updateMany({
        where: { id: organization.id, accessStatus: OrganizationAccessStatus.PROVISIONING },
        data: { accessStatus: OrganizationAccessStatus.ACTIVE },
      });
      if (activation.count !== 1) throw new Error('Organization activation conflict');
      await tx.auditEvidence.create({
        data: {
          organizationId: organization.id,
          actorId: identity.id,
          action: 'INITIAL_OWNER_INVITATION_ACCEPTED',
          reason: 'Authenticated existing identity accepted initial-owner invitation',
          subjectType: 'Invitation',
          subjectId: invitation.id,
          before: { accessStatus: OrganizationAccessStatus.PROVISIONING },
          after: {
            accessStatus: OrganizationAccessStatus.ACTIVE,
            ownerMembershipId: membership.id,
          },
        },
      });
      return { organizationId: organization.id };
    });
  }
}

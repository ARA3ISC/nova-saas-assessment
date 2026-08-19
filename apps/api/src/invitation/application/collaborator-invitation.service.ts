import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { InvitationKind, OrganizationProfile } from '@prisma/client';

import { EffectiveAccess } from '../../access/application/access.service';
import { PermissionPresetService } from '../../access/application/permission-preset.service';
import { ALLOWED_CAPABILITIES } from '../../access/domain/permission-presets';
import { NotificationService } from '../../notifications/application/notification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTenantContext } from '../../prisma/tenant-transaction';
import {
  generateInvitationToken,
  hashInvitationToken,
  normalizeInvitationEmail,
  validateInvitationInput,
} from '../domain/invitation';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class CollaboratorInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly presets: PermissionPresetService,
  ) {}

  async invite(
    access: EffectiveAccess,
    email: string,
    capabilities: string[] = [],
    rawCompanyIds: string[] = [],
    rawBusinessScopeIds: string[] = [],
    presetId?: string,
    organizationWideAccess = false,
    replacement?: { invitationId: string; reason: string },
  ): Promise<{ invitationId: string; expiresAt: Date }> {
    if (access.profile !== 'Administrator') {
      throw new ForbiddenException('Access denied');
    }

    validateInvitationInput({
      email,
      kind: InvitationKind.COLLABORATOR,
      targetProfile: OrganizationProfile.User,
    });

    const normalizedEmail = normalizeInvitationEmail(email);
    const token = generateInvitationToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const result = await withTenantContext(
      this.prisma,
      {
        organizationId: access.organizationId,
        actorId: access.identityId,
        accessEpoch: access.accessEpoch,
        membershipId: access.membershipId,
      },
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`${access.organizationId}:${normalizedEmail}`}, 0)
          )
        `;
        if (presetId) await this.presets.resolve(tx, presetId);
        const normalizedCapabilities = [
          ...new Set(capabilities.map((capability) => capability.trim()).filter(Boolean)),
        ];
        const companyIds = [...new Set(rawCompanyIds)];
        const businessScopeIds = [...new Set(rawBusinessScopeIds)];
        if (normalizedCapabilities.some((value) => !ALLOWED_CAPABILITIES.has(value))) {
          throw new ConflictException('Unknown or inactive capability');
        }
        const [capabilityCount, companyCount, businessScopeCount] = await Promise.all([
          tx.capabilityDefinition.count({
            where: {
              key: { in: normalizedCapabilities },
              active: true,
              platformOnly: false,
            },
          }),
          tx.company.count({ where: { id: { in: companyIds }, status: 'ACTIVE' } }),
          tx.businessScope.count({ where: { id: { in: businessScopeIds }, status: 'ACTIVE' } }),
        ]);
        if (
          capabilityCount !== normalizedCapabilities.length ||
          companyCount !== companyIds.length ||
          businessScopeCount !== businessScopeIds.length
        ) {
          throw new ConflictException('Unknown or inactive invitation grant');
        }
        const existing = await tx.invitation.findFirst({
          where: {
            organizationId: access.organizationId,
            normalizedEmail,
            consumedAt: null,
            revokedAt: null,
          },
          select: { id: true, expiresAt: true },
        });
        if (replacement) {
          if (!existing || existing.id !== replacement.invitationId)
            throw new ConflictException('Invitation is no longer available');
        } else if (existing && existing.expiresAt.getTime() > Date.now()) {
          throw new ConflictException(
            'A pending invitation already exists; use the reasoned resend action',
          );
        }
        if (existing)
          await tx.invitation.update({
            where: { id: existing.id },
            data: { revokedAt: new Date() },
          });

        const invitation = await tx.invitation.create({
          data: {
            organizationId: access.organizationId,
            email: email.trim(),
            normalizedEmail,
            tokenHash: hashInvitationToken(token),
            kind: InvitationKind.COLLABORATOR,
            targetProfile: OrganizationProfile.User,
            capabilities: normalizedCapabilities,
            companyIds,
            businessScopeIds,
            organizationWideAccess,
            expiresAt,
          },
          select: { id: true, expiresAt: true },
        });
        const outboxMessage = await this.notifications.enqueueCollaboratorInvitation(tx, {
          organizationId: access.organizationId,
          recipient: email.trim(),
          token,
        });
        if (replacement) {
          await tx.auditEvidence.create({
            data: {
              organizationId: access.organizationId,
              actorId: access.identityId,
              action: 'COLLABORATOR_INVITATION_RESENT',
              reason: replacement.reason,
              subjectType: 'Invitation',
              subjectId: invitation.id,
              before: { invitationId: replacement.invitationId },
              after: { invitationId: invitation.id, expiresAt: invitation.expiresAt },
            },
          });
        }

        return { invitation, outboxMessageId: outboxMessage.id };
      },
    );

    await this.notifications.deliver(result.outboxMessageId);

    return {
      invitationId: result.invitation.id,
      expiresAt: result.invitation.expiresAt,
    };
  }

  async listPending(access: EffectiveAccess) {
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
        const now = new Date();
        const invitations = await tx.invitation.findMany({
          where: {
            kind: InvitationKind.COLLABORATOR,
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: {
            id: true,
            email: true,
            expiresAt: true,
            createdAt: true,
            capabilities: true,
            companyIds: true,
            businessScopeIds: true,
            organizationWideAccess: true,
            consumedAt: true,
            revokedAt: true,
          },
        });
        return invitations.map((invitation) => ({
          ...invitation,
          status: invitation.consumedAt
            ? ('ACCEPTED' as const)
            : invitation.revokedAt
              ? ('REVOKED' as const)
              : invitation.expiresAt.getTime() <= now.getTime()
                ? ('EXPIRED' as const)
                : ('PENDING' as const),
        }));
      },
    );
  }

  async resend(access: EffectiveAccess, invitationId: string, reason: string, confirmed: boolean) {
    this.requireConfirmation(reason, confirmed);
    if (access.profile !== 'Administrator') throw new ForbiddenException('Access denied');
    const invitation = await withTenantContext(
      this.prisma,
      {
        organizationId: access.organizationId,
        actorId: access.identityId,
        accessEpoch: access.accessEpoch,
        membershipId: access.membershipId,
      },
      (tx) =>
        tx.invitation.findFirst({
          where: {
            id: invitationId,
            kind: InvitationKind.COLLABORATOR,
            consumedAt: null,
            revokedAt: null,
          },
          select: {
            email: true,
            capabilities: true,
            companyIds: true,
            businessScopeIds: true,
            organizationWideAccess: true,
          },
        }),
    );
    if (!invitation) throw new ConflictException('Invitation is no longer available');
    const strings = (value: unknown) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    return this.invite(
      access,
      invitation.email,
      strings(invitation.capabilities),
      strings(invitation.companyIds),
      strings(invitation.businessScopeIds),
      undefined,
      invitation.organizationWideAccess,
      { invitationId, reason: reason.trim() },
    );
  }

  async revoke(access: EffectiveAccess, invitationId: string, reason: string, confirmed: boolean) {
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
        const revokedAt = new Date();
        const result = await tx.invitation.updateMany({
          where: {
            id: invitationId,
            kind: InvitationKind.COLLABORATOR,
            consumedAt: null,
            revokedAt: null,
          },
          data: { revokedAt },
        });
        if (result.count !== 1) throw new ConflictException('Invitation is no longer available');
        await tx.auditEvidence.create({
          data: {
            organizationId: access.organizationId,
            actorId: access.identityId,
            action: 'COLLABORATOR_INVITATION_REVOKED',
            reason: reason.trim(),
            subjectType: 'Invitation',
            subjectId: invitationId,
            before: { status: 'PENDING' },
            after: { status: 'REVOKED', revokedAt },
          },
        });
        return { invitationId, revokedAt };
      },
    );
  }

  private requireConfirmation(reason: string, confirmed: boolean) {
    if (!confirmed || !reason.trim()) {
      throw new ConflictException('A reason and explicit confirmation are required');
    }
  }
}

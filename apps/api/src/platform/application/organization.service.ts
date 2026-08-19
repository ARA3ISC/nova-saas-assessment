import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  InvitationKind,
  OrganizationAccessStatus,
  CommercialStatus,
  OrganizationProfile,
} from '@prisma/client';

import {
  generateInvitationToken,
  hashInvitationToken,
  normalizeInvitationEmail,
  validateInvitationInput,
} from '../../invitation/domain/invitation';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../notifications/application/notification.service';
import { withTenantContext } from '../../prisma/tenant-transaction';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  async createOrganization(params: { name: string; ownerEmail: string }): Promise<{
    organizationId: string;
    invitationId: string;
    expiresAt: Date;
  }> {
    const name = params.name.trim();

    if (!name) {
      throw new ConflictException('Organization name is required');
    }

    validateInvitationInput({
      email: params.ownerEmail,
      kind: InvitationKind.INITIAL_OWNER,
      targetProfile: OrganizationProfile.Administrator,
    });

    const normalizedEmail = normalizeInvitationEmail(params.ownerEmail);

    const token = generateInvitationToken();

    const tokenHash = hashInvitationToken(token);

    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name,
          accessStatus: 'PROVISIONING',
          commercialStatus: 'DEMO',
        },
      });

      const existing = await tx.invitation.findFirst({
        where: {
          organizationId: organization.id,
          normalizedEmail,
          consumedAt: null,
          revokedAt: null,
        },
      });

      if (existing) {
        throw new ConflictException('An active invitation already exists');
      }

      const invitation = await tx.invitation.create({
        data: {
          organizationId: organization.id,
          email: params.ownerEmail.trim(),
          normalizedEmail,
          tokenHash,
          kind: InvitationKind.INITIAL_OWNER,
          targetProfile: OrganizationProfile.Administrator,
          expiresAt,
        },
      });

      const outboxMessage = await this.notifications.enqueueInitialOwnerInvitation(tx, {
        organizationId: organization.id,
        recipient: params.ownerEmail.trim(),
        token,
      });

      return {
        organizationId: organization.id,
        invitationId: invitation.id,
        outboxMessageId: outboxMessage.id,
        expiresAt: invitation.expiresAt,
      };
    });

    await this.notifications.deliver(result.outboxMessageId);

    return {
      organizationId: result.organizationId,
      invitationId: result.invitationId,
      expiresAt: result.expiresAt,
    };
  }

  async resendInitialOwnerInvitation(params: {
    organizationId: string;
    actorId: string;
    expectedVersion: number;
    reason: string;
    confirmed: boolean;
  }): Promise<{ organizationId: string; invitationId: string; expiresAt: Date; version: number }> {
    this.requireConfirmation(params.reason, params.confirmed);
    this.requireVersion(params.expectedVersion);
    const token = generateInvitationToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const result = await withTenantContext(
      this.prisma,
      { organizationId: params.organizationId, actorId: params.actorId, accessEpoch: 0 },
      async (tx) => {
        const organizations = await tx.$queryRaw<
          { id: string; accessStatus: OrganizationAccessStatus; version: number }[]
        >`
          SELECT id, "accessStatus", version
          FROM "Organization"
          WHERE id = ${params.organizationId}::uuid
          FOR UPDATE
        `;
        const organization = organizations[0];
        if (!organization || organization.accessStatus !== 'PROVISIONING')
          throw new ConflictException(
            'Only a provisioning Organization can resend this invitation',
          );
        if (organization.version !== params.expectedVersion)
          throw new ConflictException('Organization changed; refresh and retry');
        const previous = await tx.invitation.findFirst({
          where: {
            organizationId: params.organizationId,
            kind: InvitationKind.INITIAL_OWNER,
            consumedAt: null,
            revokedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, email: true, normalizedEmail: true },
        });
        if (!previous)
          throw new ConflictException('Initial owner invitation is no longer available');
        const now = new Date();
        await tx.invitation.update({
          where: { id: previous.id },
          data: { revokedAt: now },
        });
        await tx.outboxMessage.updateMany({
          where: {
            organizationId: params.organizationId,
            recipient: previous.email,
            template: 'INITIAL_OWNER_INVITATION_V1',
            status: 'PENDING',
          },
          data: {
            status: 'EXPIRED',
            encryptedEnvelope: '',
            lastFailureCode: 'CREDENTIAL_REPLACED',
          },
        });
        const invitation = await tx.invitation.create({
          data: {
            organizationId: params.organizationId,
            email: previous.email,
            normalizedEmail: previous.normalizedEmail,
            tokenHash: hashInvitationToken(token),
            kind: InvitationKind.INITIAL_OWNER,
            targetProfile: OrganizationProfile.Administrator,
            expiresAt,
          },
          select: { id: true, expiresAt: true },
        });
        const claim = await tx.organization.updateMany({
          where: { id: params.organizationId, version: params.expectedVersion },
          data: { version: { increment: 1 } },
        });
        if (claim.count !== 1)
          throw new ConflictException('Organization changed; refresh and retry');
        const outbox = await this.notifications.enqueueInitialOwnerInvitation(tx, {
          organizationId: params.organizationId,
          recipient: previous.email,
          token,
        });
        await tx.auditEvidence.create({
          data: {
            organizationId: params.organizationId,
            actorId: params.actorId,
            action: 'INITIAL_OWNER_INVITATION_RESENT',
            reason: params.reason.trim(),
            subjectType: 'Invitation',
            subjectId: invitation.id,
            before: { invitationId: previous.id, status: 'REVOKED' },
            after: { invitationId: invitation.id, expiresAt: invitation.expiresAt },
          },
        });
        return { invitation, outboxMessageId: outbox.id, version: organization.version + 1 };
      },
    );
    await this.notifications.deliver(result.outboxMessageId);
    return {
      organizationId: params.organizationId,
      invitationId: result.invitation.id,
      expiresAt: result.invitation.expiresAt,
      version: result.version,
    };
  }

  async changeAccessStatus(params: {
    organizationId: string;
    status: OrganizationAccessStatus;
    actorId: string;
    reason: string;
    confirmed: boolean;
    expectedVersion: number;
  }): Promise<{ id: string; accessStatus: OrganizationAccessStatus; version: number }> {
    this.requireConfirmation(params.reason, params.confirmed);
    this.requireVersion(params.expectedVersion);
    const now = new Date();
    const updated = await withTenantContext(
      this.prisma,
      {
        organizationId: params.organizationId,
        actorId: params.actorId,
        accessEpoch: 0,
      },
      async (tx) => {
        const organization = await tx.organization.findUnique({
          where: { id: params.organizationId },
          select: { id: true, accessStatus: true, version: true },
        });
        if (!organization) throw new ConflictException('Organization not found');
        if (organization.version !== params.expectedVersion)
          throw new ConflictException('Organization changed; refresh and retry');
        if (organization.accessStatus === params.status) {
          return {
            id: organization.id,
            accessStatus: organization.accessStatus,
            version: organization.version,
          };
        }
        const allowedTransitions: Record<OrganizationAccessStatus, OrganizationAccessStatus[]> = {
          PROVISIONING: ['DISABLED'],
          ACTIVE: ['SUSPENDED', 'DISABLED'],
          SUSPENDED: ['ACTIVE', 'DISABLED'],
          DISABLED: [],
        };
        if (!allowedTransitions[organization.accessStatus].includes(params.status)) {
          throw new ConflictException(
            organization.accessStatus === 'PROVISIONING'
              ? 'Initial owner acceptance is the only path from provisioning to active access'
              : organization.accessStatus === 'DISABLED'
                ? 'Disabled organizations cannot be reactivated'
                : 'Invalid Organization access transition',
          );
        }
        if (params.status === 'ACTIVE') {
          const ownership = await tx.organizationOwnership.findUnique({
            where: { organizationId: organization.id },
            select: {
              membership: { select: { status: true, profile: true } },
            },
          });
          if (
            ownership?.membership.status !== 'ACTIVE' ||
            ownership.membership.profile !== 'Administrator'
          ) {
            throw new ConflictException(
              'Organization access requires an active Administrator owner',
            );
          }
        }
        const claim = await tx.organization.updateMany({
          where: { id: organization.id, version: params.expectedVersion },
          data: {
            accessStatus: params.status,
            disabledAt: params.status === 'DISABLED' ? now : null,
            version: { increment: 1 },
          },
        });
        if (claim.count !== 1)
          throw new ConflictException('Organization changed; refresh and retry');
        const result = {
          id: organization.id,
          accessStatus: params.status,
          version: organization.version + 1,
        };
        if (params.status !== 'ACTIVE') {
          const memberships = await tx.membership.findMany({
            where: { organizationId: organization.id },
            select: { identityId: true },
          });
          await tx.membership.updateMany({
            where: { organizationId: organization.id },
            data: { accessEpoch: { increment: 1 }, version: { increment: 1 } },
          });
          await tx.authSession.updateMany({
            where: {
              identityId: { in: memberships.map((membership) => membership.identityId) },
              revokedAt: null,
            },
            data: { revokedAt: now },
          });
        }
        if (params.status === 'DISABLED') {
          await tx.invitation.updateMany({
            where: {
              organizationId: organization.id,
              consumedAt: null,
              revokedAt: null,
            },
            data: { revokedAt: now },
          });
          await tx.ownershipTransferProposal.updateMany({
            where: { organizationId: organization.id, status: 'PENDING' },
            data: { status: 'CANCELLED', cancelledAt: now },
          });
          await tx.outboxMessage.updateMany({
            where: { organizationId: organization.id, status: 'PENDING' },
            data: {
              status: 'EXPIRED',
              encryptedEnvelope: '',
              lastFailureCode: 'ORGANIZATION_DISABLED',
            },
          });
        }
        await tx.auditEvidence.create({
          data: {
            organizationId: organization.id,
            actorId: params.actorId,
            action: 'PLATFORM_ACCESS_STATUS_CHANGED',
            reason: params.reason.trim(),
            subjectType: 'Organization',
            subjectId: organization.id,
            before: { accessStatus: organization.accessStatus },
            after: { accessStatus: result.accessStatus },
          },
        });
        return result;
      },
    );
    return updated;
  }

  async changeCommercialStatus(params: {
    organizationId: string;
    status: CommercialStatus;
    actorId: string;
    reason: string;
    confirmed: boolean;
    expectedVersion: number;
  }): Promise<{ id: string; commercialStatus: CommercialStatus; version: number }> {
    this.requireConfirmation(params.reason, params.confirmed);
    this.requireVersion(params.expectedVersion);
    return withTenantContext(
      this.prisma,
      {
        organizationId: params.organizationId,
        actorId: params.actorId,
        accessEpoch: 0,
      },
      async (tx) => {
        const organization = await tx.organization.findUnique({
          where: { id: params.organizationId },
          select: { id: true, commercialStatus: true, version: true },
        });
        if (!organization) throw new ConflictException('Organization not found');
        if (organization.version !== params.expectedVersion)
          throw new ConflictException('Organization changed; refresh and retry');
        if (organization.commercialStatus === params.status) {
          return {
            id: organization.id,
            commercialStatus: organization.commercialStatus,
            version: organization.version,
          };
        }
        const claim = await tx.organization.updateMany({
          where: { id: organization.id, version: params.expectedVersion },
          data: { commercialStatus: params.status, version: { increment: 1 } },
        });
        if (claim.count !== 1)
          throw new ConflictException('Organization changed; refresh and retry');
        const result = {
          id: organization.id,
          commercialStatus: params.status,
          version: organization.version + 1,
        };
        await tx.auditEvidence.create({
          data: {
            organizationId: organization.id,
            actorId: params.actorId,
            action: 'PLATFORM_COMMERCIAL_STATUS_CHANGED',
            reason: params.reason.trim(),
            subjectType: 'Organization',
            subjectId: organization.id,
            before: { commercialStatus: organization.commercialStatus },
            after: { commercialStatus: result.commercialStatus },
          },
        });
        return result;
      },
    );
  }

  async listOrganizations(params: { query?: string; take?: number; cursor?: string }) {
    const take = Math.min(Math.max(params.take ?? 25, 1), 100);
    const query = params.query?.trim();
    if (
      params.cursor &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        params.cursor,
      )
    ) {
      throw new BadRequestException('Invalid directory cursor');
    }
    const rows = await this.prisma.organization.findMany({
      ...(query ? { where: { name: { contains: query, mode: 'insensitive' } } } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        accessStatus: true,
        commercialStatus: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        ownership: {
          select: { membership: { select: { identity: { select: { email: true } } } } },
        },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  async suspendCollaborator(params: {
    organizationId: string;
    membershipId: string;
    reason: string;
    actorId: string;
    confirmed: boolean;
  }) {
    this.requireConfirmation(params.reason, params.confirmed);
    return withTenantContext(
      this.prisma,
      {
        organizationId: params.organizationId,
        actorId: params.actorId,
        accessEpoch: 0,
      },
      async (tx) => {
        const organizations = await tx.$queryRaw<{ id: string }[]>`
          SELECT id
          FROM "Organization"
          WHERE id = ${params.organizationId}::uuid
            AND "accessStatus" = 'ACTIVE'
          FOR SHARE
        `;
        if (!organizations[0])
          throw new ConflictException('Interventions require an active Organization');
        const membership = await tx.membership.findFirst({
          where: {
            id: params.membershipId,
            organizationId: params.organizationId,
            status: 'ACTIVE',
          },
          select: {
            id: true,
            identityId: true,
            status: true,
            accessEpoch: true,
            version: true,
            ownership: { select: { id: true } },
          },
        });
        if (!membership || membership.ownership)
          throw new ConflictException('Eligible collaborator not found');
        const now = new Date();
        const claimed = await tx.membership.updateMany({
          where: {
            id: membership.id,
            organizationId: params.organizationId,
            status: 'ACTIVE',
            version: membership.version,
          },
          data: {
            status: 'SUSPENDED',
            suspendedAt: now,
            accessEpoch: { increment: 1 },
            version: { increment: 1 },
          },
        });
        if (claimed.count !== 1)
          throw new ConflictException('Collaborator lifecycle changed; refresh and retry');
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
            organizationId: params.organizationId,
            actorId: params.actorId,
            action: 'PLATFORM_COLLABORATOR_SUSPENDED',
            reason: params.reason.trim(),
            subjectType: 'Membership',
            subjectId: membership.id,
            before: { status: membership.status, accessEpoch: membership.accessEpoch },
            after: {
              status: 'SUSPENDED',
              accessEpoch: membership.accessEpoch + 1,
              version: membership.version + 1,
            },
          },
        });
        return { id: membership.id, status: 'SUSPENDED' as const, version: membership.version + 1 };
      },
    );
  }

  async listInterventionCandidates(organizationId: string, actorId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, accessStatus: true },
    });
    if (!organization) throw new ConflictException('Organization not found');
    if (organization.accessStatus !== 'ACTIVE') return [];
    return withTenantContext(this.prisma, { organizationId, actorId, accessEpoch: 0 }, (tx) =>
      tx.membership.findMany({
        where: { organizationId, status: 'ACTIVE', ownership: null },
        orderBy: { createdAt: 'asc' },
        take: 50,
        select: {
          id: true,
          profile: true,
          status: true,
          identity: { select: { email: true } },
        },
      }),
    );
  }

  private requireConfirmation(reason: string, confirmed: boolean) {
    if (!confirmed || !reason.trim())
      throw new ConflictException('A reason and explicit confirmation are required');
  }

  private requireVersion(version: number) {
    if (!Number.isInteger(version) || version < 1) {
      throw new ConflictException('A current Organization version is required');
    }
  }
}

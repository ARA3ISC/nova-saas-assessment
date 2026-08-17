import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InvitationKind, OrganizationProfile } from '@prisma/client';

import {
  generateInvitationToken,
  hashInvitationToken,
  normalizeInvitationEmail,
  validateInvitationInput,
} from '../domain/invitation';
import { InvitationRepository } from '../infrastructure/invitation.repository';

const INVITATION_TTL_MS =
  7 * 24 * 60 * 60 * 1000;

type InvitationRepositoryPort = Pick<
  InvitationRepository,
  | 'create'
  | 'findValidToken'
  | 'findByOrganizationEmail'
  | 'consume'
  | 'revoke'
  | 'revokePendingForOrganizationEmailAndKind'
>;

@Injectable()
export class InvitationService {
  constructor(
    private readonly repository: InvitationRepositoryPort,
  ) { }

  async createInvitation(params: {
    organizationId: string;
    email: string;
    kind: InvitationKind;
    targetProfile: OrganizationProfile;
  }): Promise<{
    id: string;
    token: string;
    expiresAt: Date;
  }> {
    validateInvitationInput({
      email: params.email,
      kind: params.kind,
      targetProfile: params.targetProfile,
    });

    const normalizedEmail =
      normalizeInvitationEmail(params.email);

    const existing =
      await this.repository.findByOrganizationEmail(
        params.organizationId,
        normalizedEmail,
      );

    if (
      existing &&
      !existing.consumedAt &&
      !existing.revokedAt &&
      existing.expiresAt > new Date()
    ) {
      throw new ConflictException(
        'An active invitation already exists',
      );
    }

    if (existing) {
      await this.repository.revoke(existing.id);
    }

    const token = generateInvitationToken();
    const tokenHash =
      hashInvitationToken(token);

    const expiresAt = new Date(
      Date.now() + INVITATION_TTL_MS,
    );

    const invitation =
      await this.repository.create({
        organizationId: params.organizationId,
        email: params.email.trim(),
        normalizedEmail,
        tokenHash,
        kind: params.kind,
        targetProfile: params.targetProfile,
        expiresAt,
      });

    return {
      id: invitation.id,
      token,
      expiresAt: invitation.expiresAt,
    };
  }

  async consumeInvitation(
    token: string,
  ): Promise<{
    id: string;
    organizationId: string;
    email: string;
    kind: InvitationKind;
    targetProfile: OrganizationProfile;
  } | null> {
    const tokenHash =
      hashInvitationToken(token);

    const invitation =
      await this.repository.findValidToken(
        tokenHash,
        new Date(),
      );

    if (!invitation) {
      return null;
    }

    await this.repository.consume(
      invitation.id,
    );

    return {
      id: invitation.id,
      organizationId:
        invitation.organizationId,
      email: invitation.email,
      kind: invitation.kind,
      targetProfile:
        invitation.targetProfile,
    };
  }

  async revokeInvitation(
    invitationId: string,
  ): Promise<void> {
    await this.repository.revoke(
      invitationId,
    );
  }
}

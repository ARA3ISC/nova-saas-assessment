import { Body, Controller, Post, Get, Query, Patch, Param, UseGuards, Req } from '@nestjs/common';

import { OrganizationService } from '../application/organization.service';
import { PlatformGuard } from './platform.guard';
import { CsrfGuard } from '../../auth/http/csrf.guard';
import { RecentAuthGuard } from '../../auth/http/recent-auth.guard';
import { CommercialStatus, OrganizationAccessStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../../auth/http/auth.request';

@Controller('platform/organizations')
@UseGuards(PlatformGuard, CsrfGuard)
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  @UseGuards(RecentAuthGuard)
  async createOrganization(
    @Body()
    body: {
      name: string;
      ownerEmail: string;
    },
  ) {
    const result = await this.organizationService.createOrganization({
      name: body.name,
      ownerEmail: body.ownerEmail,
    });

    // The raw credential is only a transient value for the transactional
    // email delivery path. Platform callers must never receive it.
    return {
      organizationId: result.organizationId,
      invitationId: result.invitationId,
      expiresAt: result.expiresAt,
    };
  }

  @Get()
  listOrganizations(
    @Query('q') query?: string,
    @Query('take') take?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedTake = take ? Number.parseInt(take, 10) : undefined;
    return this.organizationService.listOrganizations({
      ...(query ? { query } : {}),
      ...(typeof parsedTake === 'number' && Number.isFinite(parsedTake)
        ? { take: parsedTake }
        : {}),
      ...(cursor ? { cursor } : {}),
    });
  }

  @Get(':organizationId/intervention-candidates')
  listInterventionCandidates(
    @Param('organizationId') organizationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const actorId = request.authSession?.identityId;
    if (!actorId) throw new Error('Platform session missing');
    return this.organizationService.listInterventionCandidates(organizationId, actorId);
  }

  @Post(':organizationId/initial-owner-invitation/resend')
  @UseGuards(RecentAuthGuard)
  resendInitialOwnerInvitation(
    @Param('organizationId') organizationId: string,
    @Body() body: { expectedVersion: number; reason: string; confirmed: boolean },
    @Req() request: AuthenticatedRequest,
  ) {
    const actorId = request.authSession?.identityId;
    if (!actorId) throw new Error('Platform session missing');
    return this.organizationService.resendInitialOwnerInvitation({
      organizationId,
      actorId,
      expectedVersion: body.expectedVersion,
      reason: body.reason,
      confirmed: body.confirmed,
    });
  }

  @Patch(':organizationId/access-status')
  @UseGuards(RecentAuthGuard)
  changeAccessStatus(
    @Param('organizationId') organizationId: string,
    @Body()
    body: {
      status: OrganizationAccessStatus;
      reason: string;
      confirmed: boolean;
      expectedVersion: number;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    const actorId = request.authSession?.identityId;
    if (!actorId) throw new Error('Platform session missing');
    return this.organizationService.changeAccessStatus({
      organizationId,
      status: body.status,
      reason: body.reason,
      confirmed: body.confirmed,
      actorId,
      expectedVersion: body.expectedVersion,
    });
  }

  @Patch(':organizationId/commercial-status')
  @UseGuards(RecentAuthGuard)
  changeCommercialStatus(
    @Param('organizationId') organizationId: string,
    @Body()
    body: { status: CommercialStatus; reason: string; confirmed: boolean; expectedVersion: number },
    @Req() request: AuthenticatedRequest,
  ) {
    const actorId = request.authSession?.identityId;
    if (!actorId) throw new Error('Platform session missing');
    return this.organizationService.changeCommercialStatus({
      organizationId,
      status: body.status,
      reason: body.reason,
      confirmed: body.confirmed,
      actorId,
      expectedVersion: body.expectedVersion,
    });
  }

  @Post(':organizationId/interventions/suspend-collaborator')
  @UseGuards(RecentAuthGuard)
  suspendCollaborator(
    @Param('organizationId') organizationId: string,
    @Body() body: { membershipId: string; reason: string; confirmed: boolean },
    @Req() request: AuthenticatedRequest,
  ) {
    const actorId = request.authSession?.identityId;
    if (!actorId) throw new Error('Platform session missing');
    return this.organizationService.suspendCollaborator({
      organizationId,
      membershipId: body.membershipId,
      reason: body.reason,
      actorId,
      confirmed: body.confirmed,
    });
  }
}

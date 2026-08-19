import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentAccess } from '../../access/http/current-access.decorator';
import { AuthGuard } from '../../auth/http/auth.guard';
import { CsrfGuard } from '../../auth/http/csrf.guard';
import { RecentAuthGuard } from '../../auth/http/recent-auth.guard';
import { EffectiveAccess } from '../../access/application/access.service';
import { CollaboratorInvitationService } from '../application/collaborator-invitation.service';

@Controller('invitations/collaborator')
@UseGuards(AuthGuard, CsrfGuard)
export class CollaboratorInvitationController {
  constructor(private readonly collaborators: CollaboratorInvitationService) {}

  @Post()
  async invite(
    @CurrentAccess() access: EffectiveAccess,
    @Body()
    body: {
      email: string;
      capabilities?: string[];
      companyIds?: string[];
      businessScopeIds?: string[];
      presetId?: string;
      organizationWideAccess?: boolean;
    },
  ): Promise<{ invitationId: string; expiresAt: Date }> {
    return this.collaborators.invite(
      access,
      body.email,
      body.capabilities ?? [],
      body.companyIds ?? [],
      body.businessScopeIds ?? [],
      body.presetId,
      body.organizationWideAccess ?? false,
    );
  }

  @Get()
  listPending(@CurrentAccess() access: EffectiveAccess) {
    return this.collaborators.listPending(access);
  }

  @Post(':invitationId/resend')
  @UseGuards(RecentAuthGuard)
  resend(
    @CurrentAccess() access: EffectiveAccess,
    @Param('invitationId') invitationId: string,
    @Body() body: { reason: string; confirmed: boolean },
  ) {
    return this.collaborators.resend(access, invitationId, body.reason, body.confirmed);
  }

  @Post(':invitationId/revoke')
  @UseGuards(RecentAuthGuard)
  revoke(
    @CurrentAccess() access: EffectiveAccess,
    @Param('invitationId') invitationId: string,
    @Body() body: { reason: string; confirmed: boolean },
  ) {
    return this.collaborators.revoke(access, invitationId, body.reason, body.confirmed);
  }
}

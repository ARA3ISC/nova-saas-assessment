import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { CollaboratorAcceptanceService } from '../application/collaborator-acceptance.service';
import { SessionGuard } from '../../auth/http/session.guard';
import { CsrfGuard } from '../../auth/http/csrf.guard';
import { CurrentIdentity } from '../../auth/http/current-identity.decorator';

@Controller('invitations/collaborator')
export class CollaboratorAcceptanceController {
  constructor(private readonly acceptance: CollaboratorAcceptanceService) {}

  @Post('accept')
  async accept(@Body() body: { token: string; password: string }): Promise<{ accepted: boolean }> {
    return { accepted: await this.acceptance.accept(body) };
  }

  @Post('accept-existing')
  @UseGuards(SessionGuard, CsrfGuard)
  async acceptExisting(
    @CurrentIdentity() identityId: string,
    @Body() body: { token: string },
  ): Promise<{ accepted: boolean }> {
    return { accepted: await this.acceptance.acceptExisting(identityId, body.token) };
  }
}

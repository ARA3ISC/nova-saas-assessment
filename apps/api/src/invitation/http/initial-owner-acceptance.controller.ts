import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { InitialOwnerAcceptanceService } from '../application/initial-owner-acceptance.service';
import { SessionGuard } from '../../auth/http/session.guard';
import { CsrfGuard } from '../../auth/http/csrf.guard';
import { CurrentIdentity } from '../../auth/http/current-identity.decorator';

@Controller('invitations/initial-owner')
export class InitialOwnerAcceptanceController {
  constructor(private readonly initialOwnerAcceptanceService: InitialOwnerAcceptanceService) {}

  @Post('accept')
  async accept(@Body() body: { token: string; password: string }): Promise<{ accepted: boolean }> {
    const result = await this.initialOwnerAcceptanceService.accept(body);

    return { accepted: result !== null };
  }

  @Post('accept-existing')
  @UseGuards(SessionGuard, CsrfGuard)
  async acceptExisting(
    @CurrentIdentity() identityId: string,
    @Body() body: { token: string },
  ): Promise<{ accepted: boolean }> {
    return {
      accepted:
        (await this.initialOwnerAcceptanceService.acceptExisting(identityId, body.token)) !== null,
    };
  }
}

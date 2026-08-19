import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { EffectiveAccess } from '../application/access.service';
import { OwnershipService } from '../application/ownership.service';
import { AuthGuard } from '../../auth/http/auth.guard';
import { CsrfGuard } from '../../auth/http/csrf.guard';
import { RecentAuthGuard } from '../../auth/http/recent-auth.guard';
import { CurrentAccess } from './current-access.decorator';
@Controller('ownership')
@UseGuards(AuthGuard, CsrfGuard)
export class OwnershipController {
  constructor(private readonly ownership: OwnershipService) {}
  @Get('transfers')
  listPending(@CurrentAccess() access: EffectiveAccess) {
    return this.ownership.listPending(access);
  }
  @Patch('promote/:membershipId')
  @UseGuards(RecentAuthGuard)
  promote(
    @CurrentAccess() a: EffectiveAccess,
    @Param('membershipId') id: string,
    @Body() body: { reason: string; confirmed: boolean },
  ) {
    return this.ownership.promote(a, id, body.reason, body.confirmed);
  }
  @Patch('demote/:membershipId')
  @UseGuards(RecentAuthGuard)
  demote(
    @CurrentAccess() a: EffectiveAccess,
    @Param('membershipId') id: string,
    @Body() body: { reason: string; confirmed: boolean },
  ) {
    return this.ownership.demote(a, id, body.reason, body.confirmed);
  }
  @Post('transfers')
  @UseGuards(RecentAuthGuard)
  propose(
    @CurrentAccess() a: EffectiveAccess,
    @Body() body: { successorMembershipId: string; reason: string; confirmed: boolean },
  ) {
    return this.ownership.propose(a, body.successorMembershipId, body.reason, body.confirmed);
  }
  @Post('transfers/:proposalId/accept')
  @UseGuards(RecentAuthGuard)
  accept(
    @CurrentAccess() a: EffectiveAccess,
    @Param('proposalId') id: string,
    @Body() body: { reason: string; confirmed: boolean },
  ) {
    return this.ownership.accept(a, id, body.reason, body.confirmed);
  }
}

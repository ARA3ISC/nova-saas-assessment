import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { EffectiveAccess } from '../application/access.service';
import { CollaboratorLifecycleService } from '../application/collaborator-lifecycle.service';
import { AuthGuard } from '../../auth/http/auth.guard';
import { CsrfGuard } from '../../auth/http/csrf.guard';
import { RecentAuthGuard } from '../../auth/http/recent-auth.guard';
import { CurrentAccess } from './current-access.decorator';

@Controller('collaborators')
@UseGuards(AuthGuard, CsrfGuard)
export class CollaboratorLifecycleController {
  constructor(private readonly lifecycle: CollaboratorLifecycleService) {}
  @Get()
  list(@CurrentAccess() access: EffectiveAccess) {
    return this.lifecycle.list(access);
  }
  @Patch(':membershipId/suspend')
  @UseGuards(RecentAuthGuard)
  suspend(
    @CurrentAccess() access: EffectiveAccess,
    @Param('membershipId') id: string,
    @Body() body: { reason: string; confirmed: boolean },
  ) {
    return this.lifecycle.suspend(access, id, body.reason, body.confirmed);
  }
  @Patch(':membershipId/reactivate')
  @UseGuards(RecentAuthGuard)
  reactivate(
    @CurrentAccess() access: EffectiveAccess,
    @Param('membershipId') id: string,
    @Body() body: { reason: string; confirmed: boolean },
  ) {
    return this.lifecycle.reactivate(access, id, body.reason, body.confirmed);
  }
  @Patch(':membershipId/remove')
  @UseGuards(RecentAuthGuard)
  remove(
    @CurrentAccess() access: EffectiveAccess,
    @Param('membershipId') id: string,
    @Body() body: { reason: string; confirmed: boolean },
  ) {
    return this.lifecycle.remove(access, id, body.reason, body.confirmed);
  }
  @Patch(':membershipId/grants')
  @UseGuards(RecentAuthGuard)
  replaceGrants(
    @CurrentAccess() access: EffectiveAccess,
    @Param('membershipId') id: string,
    @Body()
    body: {
      capabilities?: string[];
      companyIds?: string[];
      businessScopeIds?: string[];
      organizationWideAccess?: boolean;
      expectedVersion: number;
      presetId?: string;
      reason: string;
      confirmed: boolean;
    },
  ) {
    return this.lifecycle.replaceGrants(access, id, {
      capabilities: body.capabilities ?? [],
      companyIds: body.companyIds ?? [],
      businessScopeIds: body.businessScopeIds ?? [],
      organizationWideAccess: body.organizationWideAccess ?? false,
      expectedVersion: body.expectedVersion,
      reason: body.reason,
      confirmed: body.confirmed,
      ...(body.presetId ? { presetId: body.presetId } : {}),
    });
  }
}

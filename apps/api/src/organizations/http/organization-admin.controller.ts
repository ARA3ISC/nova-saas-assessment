import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BusinessScopeType } from '@prisma/client';

import { EffectiveAccess } from '../../access/application/access.service';
import { CurrentAccess } from '../../access/http/current-access.decorator';
import { AuthGuard } from '../../auth/http/auth.guard';
import { CsrfGuard } from '../../auth/http/csrf.guard';
import { RecentAuthGuard } from '../../auth/http/recent-auth.guard';
import { OrganizationAdminService } from '../application/organization-admin.service';

@Controller('organizations')
@UseGuards(AuthGuard, CsrfGuard)
export class OrganizationAdminController {
  constructor(private readonly service: OrganizationAdminService) {}

  @Post('companies')
  createCompany(@CurrentAccess() access: EffectiveAccess, @Body() body: { name: string }) {
    return this.service.createCompany(access, body.name);
  }

  @Get('companies')
  listCompanies(@CurrentAccess() access: EffectiveAccess, @Query('q') query?: string) {
    return this.service.listCompanies(access, query);
  }

  @Post('business-scopes')
  createScope(
    @CurrentAccess() access: EffectiveAccess,
    @Body()
    body: {
      companyId: string;
      type: BusinessScopeType;
      name: string;
      externalIdentifier?: string;
      location?: string;
      responsiblePerson?: string;
      sectorCounterpart?: string;
      confirmed: boolean;
    },
  ) {
    return this.service.createBusinessScope(access, body);
  }

  @Get('business-scopes')
  listScopes(@CurrentAccess() access: EffectiveAccess, @Query('q') query?: string) {
    return this.service.listBusinessScopes(access, query);
  }

  @Post('business-scopes/duplicate-check')
  duplicateCheck(
    @CurrentAccess() access: EffectiveAccess,
    @Body()
    body: { companyId: string; type: BusinessScopeType; name: string; externalIdentifier?: string },
  ) {
    return this.service.findBusinessScopeDuplicate(access, body);
  }

  @Patch('companies/:companyId/deactivate')
  @UseGuards(RecentAuthGuard)
  deactivateCompany(
    @CurrentAccess() access: EffectiveAccess,
    @Param('companyId') companyId: string,
    @Body() body: { reason: string; confirmed: boolean },
  ) {
    return this.service.deactivateCompany(access, companyId, body.reason, body.confirmed);
  }

  @Patch('companies/:companyId/reactivate')
  @UseGuards(RecentAuthGuard)
  reactivateCompany(
    @CurrentAccess() access: EffectiveAccess,
    @Param('companyId') companyId: string,
    @Body() body: { reason: string; confirmed: boolean },
  ) {
    return this.service.reactivateCompany(access, companyId, body.reason, body.confirmed);
  }

  @Patch('companies/:companyId')
  renameCompany(
    @CurrentAccess() access: EffectiveAccess,
    @Param('companyId') companyId: string,
    @Body() body: { name: string; expectedVersion: number },
  ) {
    return this.service.renameCompany(access, companyId, body.name, body.expectedVersion);
  }

  @Patch('business-scopes/:scopeId/deactivate')
  @UseGuards(RecentAuthGuard)
  deactivateScope(
    @CurrentAccess() access: EffectiveAccess,
    @Param('scopeId') scopeId: string,
    @Body() body: { reason: string; confirmed: boolean },
  ) {
    return this.service.deactivateBusinessScope(access, scopeId, body.reason, body.confirmed);
  }

  @Patch('business-scopes/:scopeId/reactivate')
  @UseGuards(RecentAuthGuard)
  reactivateScope(
    @CurrentAccess() access: EffectiveAccess,
    @Param('scopeId') scopeId: string,
    @Body() body: { reason: string; confirmed: boolean },
  ) {
    return this.service.reactivateBusinessScope(access, scopeId, body.reason, body.confirmed);
  }

  @Patch('business-scopes/:scopeId')
  updateScope(
    @CurrentAccess() access: EffectiveAccess,
    @Param('scopeId') scopeId: string,
    @Body()
    body: {
      type: BusinessScopeType;
      name: string;
      externalIdentifier?: string;
      location?: string;
      responsiblePerson?: string;
      sectorCounterpart?: string;
      expectedVersion: number;
    },
  ) {
    return this.service.updateBusinessScope(access, scopeId, body);
  }
}

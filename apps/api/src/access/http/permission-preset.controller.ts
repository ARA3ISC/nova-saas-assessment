import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../../auth/http/auth.guard';
import { CsrfGuard } from '../../auth/http/csrf.guard';
import { RecentAuthGuard } from '../../auth/http/recent-auth.guard';
import { CurrentAccess } from './current-access.decorator';
import { EffectiveAccess } from '../application/access.service';
import { PermissionPresetService } from '../application/permission-preset.service';

@Controller('permission-presets')
@UseGuards(AuthGuard)
export class PermissionPresetController {
  constructor(private readonly presets: PermissionPresetService) {}

  @Get()
  list(@CurrentAccess() access: EffectiveAccess) {
    return this.presets.list(access);
  }

  @Post()
  @UseGuards(CsrfGuard, RecentAuthGuard)
  createVersion(
    @CurrentAccess() access: EffectiveAccess,
    @Body()
    body: {
      key: string;
      label: string;
      capabilities?: string[];
      reason: string;
      confirmed: boolean;
    },
  ) {
    return this.presets.createVersion(access, {
      key: body.key,
      label: body.label,
      capabilities: body.capabilities ?? [],
      reason: body.reason,
      confirmed: body.confirmed,
    });
  }
}

import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { OrganizationService } from './application/organization.service';
import { PlatformBootstrapService } from './application/platform-bootstrap.service';
import { OrganizationController } from './http/organization.controller';
import { PlatformBootstrapController } from './http/platform-bootstrap.controller';
import { PlatformGuard } from './http/platform.guard';
import { PlatformRepository } from './infrastructure/platform.repository';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [OrganizationController, PlatformBootstrapController],
  providers: [PlatformRepository, PlatformGuard, OrganizationService, PlatformBootstrapService],
  exports: [OrganizationService],
})
export class PlatformModule {}

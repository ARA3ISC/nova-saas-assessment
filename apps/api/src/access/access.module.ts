import { Module } from '@nestjs/common';

import { AccessService } from './application/access.service';
import { CollaboratorLifecycleService } from './application/collaborator-lifecycle.service';
import { OwnershipService } from './application/ownership.service';
import { PermissionPresetService } from './application/permission-preset.service';
import { AccessRepository } from './infrastructure/access.repository';

@Module({
  providers: [
    AccessRepository,
    AccessService,
    CollaboratorLifecycleService,
    OwnershipService,
    PermissionPresetService,
  ],
  exports: [AccessService, CollaboratorLifecycleService, OwnershipService, PermissionPresetService],
})
export class AccessModule {}

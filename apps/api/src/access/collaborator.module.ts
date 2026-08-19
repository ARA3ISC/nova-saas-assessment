import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessModule } from './access.module';
import { CollaboratorLifecycleController } from './http/collaborator-lifecycle.controller';
import { OwnershipController } from './http/ownership.controller';
import { PermissionPresetController } from './http/permission-preset.controller';

@Module({
  imports: [AuthModule, AccessModule],
  controllers: [CollaboratorLifecycleController, OwnershipController, PermissionPresetController],
})
export class CollaboratorModule {}

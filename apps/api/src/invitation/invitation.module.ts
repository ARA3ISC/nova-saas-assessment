import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { InitialOwnerAcceptanceService } from './application/initial-owner-acceptance.service';
import { CollaboratorInvitationService } from './application/collaborator-invitation.service';
import { CollaboratorAcceptanceService } from './application/collaborator-acceptance.service';
import { InvitationService } from './application/invitation.service';
import { CollaboratorInvitationController } from './http/collaborator-invitation.controller';
import { CollaboratorAcceptanceController } from './http/collaborator-acceptance.controller';
import { InitialOwnerAcceptanceController } from './http/initial-owner-acceptance.controller';
import { InvitationRepository } from './infrastructure/invitation.repository';

@Module({
  imports: [AccessModule, AuthModule, NotificationsModule],
  controllers: [
    InitialOwnerAcceptanceController,
    CollaboratorInvitationController,
    CollaboratorAcceptanceController,
  ],
  providers: [
    InvitationRepository,
    InvitationService,
    InitialOwnerAcceptanceService,
    CollaboratorInvitationService,
    CollaboratorAcceptanceService,
  ],
  exports: [
    InvitationService,
    InitialOwnerAcceptanceService,
    CollaboratorInvitationService,
    CollaboratorAcceptanceService,
  ],
})
export class InvitationModule {}

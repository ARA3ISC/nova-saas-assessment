import { Module } from '@nestjs/common';

import { InvitationService } from './application/invitation.service';
import { InvitationRepository } from './infrastructure/invitation.repository';

@Module({
  providers: [
    InvitationRepository,
    InvitationService,
  ],
  exports: [
    InvitationService,
  ],
})
export class InvitationModule {}

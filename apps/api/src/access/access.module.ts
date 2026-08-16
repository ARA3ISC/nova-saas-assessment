import { Module } from '@nestjs/common';

import { AccessService } from './application/access.service';
import { AccessRepository } from './infrastructure/access.repository';

@Module({
  providers: [
    AccessRepository,
    AccessService,
  ],
  exports: [
    AccessService,
  ],
})
export class AccessModule {}

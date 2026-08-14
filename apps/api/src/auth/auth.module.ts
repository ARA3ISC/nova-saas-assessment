import { Module } from '@nestjs/common';

import { AuthService } from './application/auth.service';
import { AuthRepository } from './infrastructure/auth.repository';

@Module({
  providers: [AuthRepository, AuthService],
  exports: [AuthRepository, AuthService],
})
export class AuthModule {}

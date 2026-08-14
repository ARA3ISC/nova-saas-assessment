import { Module } from '@nestjs/common';
import { AuthThrottleService } from './application/auth.throttle';

import { AuthService } from './application/auth.service';
import { AuthRepository } from './infrastructure/auth.repository';

@Module({
	providers: [AuthRepository, AuthService, AuthThrottleService],
  exports: [AuthRepository, AuthService, AuthThrottleService],
})
export class AuthModule {}

import { Module } from '@nestjs/common';

import { AuthThrottleService } from './application/auth.throttle';
import { AuthService } from './application/auth.service';
import { AuthRepository } from './infrastructure/auth.repository';
import { AuthController } from './http/auth.controller';
import { AuthGuard } from './http/auth.guard';

@Module({
  controllers: [AuthController],
  providers: [
		AuthRepository,
		AuthService,
		AuthThrottleService,
		AuthGuard,
	],
  exports: [
		AuthRepository,
		AuthService,
		AuthThrottleService,
		AuthGuard,
	],
})
export class AuthModule {}

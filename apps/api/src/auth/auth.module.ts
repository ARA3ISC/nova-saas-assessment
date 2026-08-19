import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';

import { AuthThrottleService } from './application/auth.throttle';
import { AuthService } from './application/auth.service';
import { AuthRepository } from './infrastructure/auth.repository';
import { AuthController } from './http/auth.controller';
import { AuthGuard } from './http/auth.guard';
import { CsrfGuard } from './http/csrf.guard';
import { RecentAuthGuard } from './http/recent-auth.guard';
import { SessionGuard } from './http/session.guard';

@Module({
  imports: [AccessModule],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    AuthThrottleService,
    AuthGuard,
    CsrfGuard,
    RecentAuthGuard,
    SessionGuard,
  ],
  exports: [
    AccessModule,
    AuthRepository,
    AuthService,
    AuthThrottleService,
    AuthGuard,
    CsrfGuard,
    RecentAuthGuard,
    SessionGuard,
  ],
})
export class AuthModule {}

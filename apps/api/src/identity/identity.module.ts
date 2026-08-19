import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PasswordResetService } from './application/password-reset.service';
import { PasswordResetHttpService } from './application/password-reset-http.service';
import { PasswordResetRepository } from './infrastructure/password-reset.repository';
import { PasswordResetController } from './http/password-reset.controller';
import { AuthModule } from '../auth/auth.module';
@Module({
  imports: [NotificationsModule, AuthModule],
  controllers: [PasswordResetController],
  providers: [PasswordResetRepository, PasswordResetService, PasswordResetHttpService],
})
export class IdentityModule {}

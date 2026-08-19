import { Module } from '@nestjs/common';

import { NotificationService } from './application/notification.service';
import { EMAIL_SENDER, ResendEmailSender } from './infrastructure/email-sender';

@Module({
  providers: [
    NotificationService,
    ResendEmailSender,
    { provide: EMAIL_SENDER, useExisting: ResendEmailSender },
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}

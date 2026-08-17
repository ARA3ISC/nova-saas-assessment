import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

import { AccessModule } from './access/access.module';
import { AuthModule } from './auth/auth.module';
import { InvitationModule } from './invitation/invitation.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AccessModule,
    InvitationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

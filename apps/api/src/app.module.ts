import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AccessModule } from './access/access.module';
import { CollaboratorModule } from './access/collaborator.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { InvitationModule } from './invitation/invitation.module';
import { IdentityModule } from './identity/identity.module';
import { PlatformModule } from './platform/platform.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { CorrelationMiddleware } from './common/http/correlation.middleware';
import { ProblemDetailsFilter } from './common/http/problem-details.filter';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AccessModule,
    CollaboratorModule,
    InvitationModule,
    IdentityModule,
    PlatformModule,
    OrganizationsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}

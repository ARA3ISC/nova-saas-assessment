import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationAdminService } from './application/organization-admin.service';
import { OrganizationAdminController } from './http/organization-admin.controller';

@Module({
  imports: [AuthModule],
  controllers: [OrganizationAdminController],
  providers: [OrganizationAdminService],
})
export class OrganizationsModule {}

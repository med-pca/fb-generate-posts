import { Global, Module } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AutomationAuthGuard } from './automation-auth.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, AdminAuthGuard, AutomationAuthGuard],
  exports: [AuthService, AdminAuthGuard, AutomationAuthGuard],
})
export class AuthModule {}

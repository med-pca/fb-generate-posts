import { Global, Module } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AutomationAuthGuard } from './automation-auth.guard';
import { SessionService } from './session.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, AdminAuthGuard, AutomationAuthGuard],
  exports: [AuthService, SessionService, AdminAuthGuard, AutomationAuthGuard],
})
export class AuthModule {}

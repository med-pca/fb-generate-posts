import { CanActivate, ExecutionContext } from '@nestjs/common';
export declare class AdminRoleGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean;
}

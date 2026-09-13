import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class AutomationAuthGuard implements CanActivate {
    private readonly config;
    constructor(config: ConfigService);
    canActivate(context: ExecutionContext): boolean;
}

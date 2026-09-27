import { CanActivate, ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
export declare class AdminAuthGuard implements CanActivate {
    private readonly auth;
    private readonly prisma;
    constructor(auth: AuthService, prisma: PrismaService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}

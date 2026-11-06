import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export declare class WordpressGuard implements CanActivate {
    private readonly config;
    private readonly prisma?;
    constructor(config: ConfigService, prisma?: PrismaService | undefined);
    private globalKey;
    canActivate(context: ExecutionContext): boolean | Promise<boolean>;
    private siteKeyMatches;
}

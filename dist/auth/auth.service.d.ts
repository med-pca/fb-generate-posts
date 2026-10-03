import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
export declare class AuthService {
    private readonly config;
    private readonly prisma;
    constructor(config: ConfigService, prisma: PrismaService);
    check(dto: LoginDto): Promise<{
        id: string;
        createdAt: Date;
        username: string;
        passwordHash: string;
        role: import("@prisma/client").$Enums.Role;
        status: import("@prisma/client").$Enums.RecordStatus;
        automationKey: string;
        nstApiKey: string | null;
        updatedAt: Date;
    }>;
    private authenticate;
    private equal;
}

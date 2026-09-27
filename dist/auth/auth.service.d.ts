import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
export declare class AuthService {
    private readonly config;
    private readonly prisma;
    constructor(config: ConfigService, prisma: PrismaService);
    login(dto: LoginDto): Promise<{
        accessToken: string;
        expiresAt: number;
        user: {
            id: string;
            username: string;
            role: import("@prisma/client").$Enums.Role;
        };
    }>;
    private authenticate;
    read(token: string): {
        id: string;
        username: string;
        role: import("@prisma/client").$Enums.Role | undefined;
    } | null;
    verify(token: string): boolean;
    private sign;
    private equal;
    private required;
}

import type { FastifyReply, FastifyRequest } from 'fastify';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SessionService } from './session.service';
import { LoginThrottle } from './login-throttle';
import type { CurrentUser } from './current-user';
export declare const loginThrottle: LoginThrottle;
export declare class AuthController {
    private readonly auth;
    private readonly sessions;
    private readonly prisma;
    constructor(auth: AuthService, sessions: SessionService, prisma: PrismaService);
    login(dto: LoginDto, request: FastifyRequest, reply: FastifyReply): Promise<{
        expiresAt: Date;
        user: {
            id: string;
            username: string;
            role: import("@prisma/client").$Enums.Role;
        };
    }>;
    logout(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    logoutEverywhere(acting: CurrentUser, request: FastifyRequest, reply: FastifyReply): Promise<{
        closed: number;
    }>;
    current(acting: CurrentUser): {
        user: CurrentUser;
    };
    private log;
}

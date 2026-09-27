import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
export declare class AuthController {
    private readonly auth;
    constructor(auth: AuthService);
    login(dto: LoginDto): Promise<{
        accessToken: string;
        expiresAt: number;
        user: {
            id: string;
            username: string;
            role: import("@prisma/client").$Enums.Role;
        };
    }>;
}

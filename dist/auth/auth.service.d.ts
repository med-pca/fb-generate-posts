import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';
export declare class AuthService {
    private readonly config;
    constructor(config: ConfigService);
    login(dto: LoginDto): {
        accessToken: string;
        expiresAt: number;
    };
    verify(token: string): boolean;
    private sign;
    private equal;
    private required;
}

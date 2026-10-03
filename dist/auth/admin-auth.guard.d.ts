import { CanActivate, ExecutionContext } from '@nestjs/common';
import { SessionService } from './session.service';
import { RequestWithUser } from './current-user';
export declare function sameOrigin(headers: RequestWithUser['headers']): boolean;
export declare class AdminAuthGuard implements CanActivate {
    private readonly sessions;
    constructor(sessions: SessionService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}

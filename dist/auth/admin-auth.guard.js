"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAuthGuard = void 0;
exports.sameOrigin = sameOrigin;
const common_1 = require("@nestjs/common");
const session_service_1 = require("./session.service");
const cookies_1 = require("./cookies");
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
function sameOrigin(headers) {
    const host = String(headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim().toLowerCase();
    const source = String(headers.origin || headers.referer || '');
    if (source) {
        try {
            return new URL(source).host.toLowerCase() === host;
        }
        catch {
            return false;
        }
    }
    return headers['x-requested-with'] === 'PostFlow';
}
let AdminAuthGuard = class AdminAuthGuard {
    sessions;
    constructor(sessions) {
        this.sessions = sessions;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const token = (0, cookies_1.sessionTokenFrom)(request.headers);
        const session = token ? await this.sessions.validate(token) : null;
        if (!session)
            throw new common_1.UnauthorizedException('Session requise : connectez-vous');
        if (!SAFE_METHODS.has(request.method) && !sameOrigin(request.headers)) {
            throw new common_1.ForbiddenException('Requête refusée : elle ne vient pas de la plateforme');
        }
        const { user } = session;
        request.user = { id: user.id, username: user.username, role: user.role, status: user.status };
        return true;
    }
};
exports.AdminAuthGuard = AdminAuthGuard;
exports.AdminAuthGuard = AdminAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [session_service_1.SessionService])
], AdminAuthGuard);
//# sourceMappingURL=admin-auth.guard.js.map
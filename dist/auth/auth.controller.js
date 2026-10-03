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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = exports.loginThrottle = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const prisma_service_1 = require("../prisma/prisma.service");
const auth_service_1 = require("./auth.service");
const login_dto_1 = require("./dto/login.dto");
const session_service_1 = require("./session.service");
const login_throttle_1 = require("./login-throttle");
const admin_auth_guard_1 = require("./admin-auth.guard");
const current_user_1 = require("./current-user");
const cookies_1 = require("./cookies");
exports.loginThrottle = new login_throttle_1.LoginThrottle();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let AuthController = class AuthController {
    auth;
    sessions;
    prisma;
    constructor(auth, sessions, prisma) {
        this.auth = auth;
        this.sessions = sessions;
        this.prisma = prisma;
    }
    async login(dto, request, reply) {
        const ip = (0, cookies_1.clientIp)(request.headers, request.ip) ?? 'inconnue';
        const username = dto.username.trim();
        const wait = exports.loginThrottle.blockedFor(ip, username);
        if (wait) {
            await this.log('AUTH_LOGIN_LOCKED', 'ERROR', `Connexion bloquée pour « ${username} » depuis ${ip} : trop d’échecs`, { ip, username });
            throw new common_1.HttpException(`Trop de tentatives. Réessayez dans ${Math.ceil(wait / 60)} minute(s).`, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        let user;
        try {
            user = await this.auth.check({ ...dto, username });
        }
        catch (error) {
            exports.loginThrottle.fail(ip, username);
            await this.log('AUTH_LOGIN_FAILED', 'WARN', `Échec de connexion pour « ${username} » depuis ${ip}`, { ip, username });
            await sleep(400);
            throw error instanceof common_1.UnauthorizedException ? error : new common_1.UnauthorizedException('Identifiant ou mot de passe incorrect');
        }
        exports.loginThrottle.succeed(ip, username);
        const session = await this.sessions.create(user.id, {
            ip,
            userAgent: String(request.headers['user-agent'] || ''),
        });
        reply.header('set-cookie', (0, cookies_1.sessionCookie)(session.token, session.maxAgeSeconds, (0, cookies_1.isSecure)(request.headers)));
        reply.header('cache-control', 'no-store');
        await this.log('AUTH_LOGIN', 'INFO', `Connexion de « ${user.username} » depuis ${ip}`, { ip, userId: user.id });
        void this.sessions.purge().catch(() => undefined);
        return {
            expiresAt: session.expiresAt,
            user: { id: user.id, username: user.username, role: user.role },
        };
    }
    async logout(request, reply) {
        const token = (0, cookies_1.sessionTokenFrom)(request.headers);
        if (token) {
            const current = await this.sessions.validate(token);
            await this.sessions.revoke(token);
            if (current)
                await this.log('AUTH_LOGOUT', 'INFO', `Déconnexion de « ${current.user.username} »`, { userId: current.user.id });
        }
        reply.header('set-cookie', (0, cookies_1.clearSessionCookies)((0, cookies_1.isSecure)(request.headers)));
        reply.header('cache-control', 'no-store');
    }
    async logoutEverywhere(acting, request, reply) {
        const closed = await this.sessions.revokeAll(acting.id);
        reply.header('set-cookie', (0, cookies_1.clearSessionCookies)((0, cookies_1.isSecure)(request.headers)));
        await this.log('AUTH_LOGOUT_ALL', 'WARN', `« ${acting.username} » a fermé ses ${closed} session(s)`, { userId: acting.id });
        return { closed };
    }
    current(acting) {
        return { user: acting };
    }
    log(eventType, level, message, metadata) {
        return this.prisma.activityLog
            .create({ data: { eventType, level, message, metadata: metadata } })
            .catch(() => undefined);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: 'Se connecter : ouvre une session dans un cookie HttpOnly',
        description: '5 échecs en 15 min pour un identifiant (20 pour une adresse) bloquent 15 min.',
    }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(204),
    (0, swagger_1.ApiOperation)({ summary: 'Se déconnecter : la session est révoquée côté serveur' }),
    openapi.ApiResponse({ status: 204 }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Post)('logout-everywhere'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Fermer toutes ses sessions (tous les navigateurs)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logoutEverywhere", null);
__decorate([
    (0, common_1.Get)('session'),
    (0, common_1.UseGuards)(admin_auth_guard_1.AdminAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'La session en cours (qui est connecté)' }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, current_user_1.ActingUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "current", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        session_service_1.SessionService,
        prisma_service_1.PrismaService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map
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
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const auth_service_1 = require("./auth.service");
let AdminAuthGuard = class AdminAuthGuard {
    auth;
    prisma;
    constructor(auth, prisma) {
        this.auth = auth;
        this.prisma = prisma;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const header = request.headers.authorization;
        const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
        const claims = token ? this.auth.read(token) : null;
        if (!claims) {
            throw new common_1.UnauthorizedException('Session administrateur requise');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: claims.id },
        });
        if (!user || user.status !== client_1.RecordStatus.ACTIVE) {
            throw new common_1.UnauthorizedException('Ce compte n’a plus accès');
        }
        request.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            status: user.status,
        };
        return true;
    }
};
exports.AdminAuthGuard = AdminAuthGuard;
exports.AdminAuthGuard = AdminAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        prisma_service_1.PrismaService])
], AdminAuthGuard);
//# sourceMappingURL=admin-auth.guard.js.map
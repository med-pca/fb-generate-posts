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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const password_1 = require("./password");
let dummy = '';
const DUMMY_HASH = () => (dummy ||= (0, password_1.hashPassword)('mot-de-passe-factice'));
let AuthService = class AuthService {
    config;
    prisma;
    constructor(config, prisma) {
        this.config = config;
        this.prisma = prisma;
    }
    async check(dto) {
        const user = await this.authenticate(dto);
        if (!user)
            throw new common_1.UnauthorizedException('Identifiant ou mot de passe incorrect');
        if (user.status !== client_1.RecordStatus.ACTIVE) {
            throw new common_1.UnauthorizedException('Ce compte est désactivé');
        }
        return user;
    }
    async authenticate(dto) {
        const user = await this.prisma.user.findUnique({
            where: { username: dto.username },
        });
        if (user)
            return (0, password_1.verifyPassword)(dto.password, user.passwordHash) ? user : null;
        const username = this.config.get('ADMIN_USERNAME');
        const password = this.config.get('ADMIN_PASSWORD');
        if (!username || !password || !this.equal(dto.username, username)) {
            (0, password_1.verifyPassword)(dto.password, DUMMY_HASH());
            return null;
        }
        if (!this.equal(dto.username, username) ||
            !this.equal(dto.password, password)) {
            return null;
        }
        return this.prisma.user.create({
            data: {
                username,
                passwordHash: (0, password_1.hashPassword)(password),
                role: client_1.Role.ADMIN,
                automationKey: this.config.get('AUTOMATION_API_KEY') || (0, password_1.newAutomationKey)(),
            },
        });
    }
    equal(left, right) {
        const a = (0, node_crypto_1.createHmac)('sha256', 'compare').update(left).digest();
        const b = (0, node_crypto_1.createHmac)('sha256', 'compare').update(right).digest();
        return (0, node_crypto_1.timingSafeEqual)(a, b);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], AuthService);
//# sourceMappingURL=auth.service.js.map
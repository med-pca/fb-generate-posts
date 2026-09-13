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
const node_crypto_1 = require("node:crypto");
let AuthService = class AuthService {
    config;
    constructor(config) {
        this.config = config;
    }
    login(dto) {
        const username = this.required('ADMIN_USERNAME');
        const password = this.required('ADMIN_PASSWORD');
        if (!this.equal(dto.username, username) || !this.equal(dto.password, password)) {
            throw new common_1.UnauthorizedException('Identifiants incorrects');
        }
        const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
        const payload = Buffer.from(JSON.stringify({ sub: username, exp: expiresAt, nonce: (0, node_crypto_1.randomBytes)(12).toString('hex') })).toString('base64url');
        return { accessToken: `${payload}.${this.sign(payload)}`, expiresAt };
    }
    verify(token) {
        const [payload, signature] = token.split('.');
        if (!payload || !signature || !this.equal(signature, this.sign(payload)))
            return false;
        try {
            const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
            return typeof data.exp === 'number' && data.exp > Date.now();
        }
        catch {
            return false;
        }
    }
    sign(payload) {
        return (0, node_crypto_1.createHmac)('sha256', this.required('AUTH_SECRET')).update(payload).digest('base64url');
    }
    equal(left, right) {
        const a = (0, node_crypto_1.createHmac)('sha256', 'compare').update(left).digest();
        const b = (0, node_crypto_1.createHmac)('sha256', 'compare').update(right).digest();
        return (0, node_crypto_1.timingSafeEqual)(a, b);
    }
    required(name) {
        const value = this.config.get(name);
        if (!value)
            throw new common_1.ServiceUnavailableException(`${name} doit être configuré`);
        return value;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map
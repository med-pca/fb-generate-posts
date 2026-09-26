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
exports.WordpressGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_crypto_1 = require("node:crypto");
let WordpressGuard = class WordpressGuard {
    config;
    constructor(config) {
        this.config = config;
    }
    canActivate(context) {
        const expected = this.config.get('WORDPRESS_API_KEY');
        if (!expected)
            throw new common_1.ServiceUnavailableException('WORDPRESS_API_KEY doit être configuré');
        const request = context.switchToHttp().getRequest();
        const provided = String(request.headers['x-api-key'] || '');
        const digest = (value) => (0, node_crypto_1.createHmac)('sha256', 'wordpress').update(value).digest();
        if (!provided || !(0, node_crypto_1.timingSafeEqual)(digest(provided), digest(expected))) {
            throw new common_1.UnauthorizedException('Clé WordPress invalide');
        }
        return true;
    }
};
exports.WordpressGuard = WordpressGuard;
exports.WordpressGuard = WordpressGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], WordpressGuard);
//# sourceMappingURL=wordpress.guard.js.map
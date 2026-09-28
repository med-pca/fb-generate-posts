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
exports.PairController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const pair_dto_1 = require("./dto/pair.dto");
const runners_service_1 = require("./runners.service");
let PairController = class PairController {
    runners;
    constructor(runners) {
        this.runners = runners;
    }
    pair(dto, request) {
        return this.runners.pair(dto.code, publicApiBaseUrl(request), request.ip);
    }
};
exports.PairController = PairController;
__decorate([
    (0, common_1.Post)('pair'),
    (0, swagger_1.ApiOperation)({
        summary: 'Échanger un code d’appairage contre les réglages du navigateur',
        description: 'Rend l’adresse de l’API, une clé d’automatisation et l’identifiant du ' +
            'profil. Le code porte l’identité du profil : l’opérateur n’a donc rien ' +
            'à choisir, il colle le code de la ligne qu’il veut.',
    }),
    openapi.ApiResponse({ status: 201 }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [pair_dto_1.PairDto, Object]),
    __metadata("design:returntype", void 0)
], PairController.prototype, "pair", null);
exports.PairController = PairController = __decorate([
    (0, swagger_1.ApiTags)('control'),
    (0, common_1.Controller)('control'),
    __metadata("design:paramtypes", [runners_service_1.RunnersService])
], PairController);
function publicApiBaseUrl(request) {
    const configured = process.env.PUBLIC_API_BASE_URL;
    if (configured)
        return configured.replace(/\/+$/, '');
    const first = (value, fallback) => String((Array.isArray(value) ? value[0] : value) || fallback)
        .split(',')[0]
        .trim();
    const host = first(request.headers['x-forwarded-host'] ?? request.headers.host, 'localhost:3000');
    const protocol = first(request.headers['x-forwarded-proto'] ?? request.protocol, 'http');
    return `${protocol}://${host}/api`;
}
//# sourceMappingURL=pair.controller.js.map
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
exports.MediaController = void 0;
const openapi = require("@nestjs/swagger");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const automation_auth_guard_1 = require("../auth/automation-auth.guard");
const media_service_1 = require("./media.service");
let MediaController = class MediaController {
    media;
    constructor(media) {
        this.media = media;
    }
    async image(url) {
        const { buffer, type } = await this.media.fetchPostImage(url);
        return new common_1.StreamableFile(buffer, { type, length: buffer.length });
    }
};
exports.MediaController = MediaController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: 'L’image d’un post, relayée par l’API',
        description: 'Secours de l’extension quand un site refuse de lui donner l’image. ' +
            'Seules les images utilisées par un post ou un profil sont servies.',
    }),
    (0, swagger_1.ApiQuery)({ name: 'url', required: true }),
    openapi.ApiResponse({ status: 200 }),
    __param(0, (0, common_1.Query)('url')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "image", null);
exports.MediaController = MediaController = __decorate([
    (0, swagger_1.ApiTags)('jobs'),
    (0, swagger_1.ApiHeader)({ name: 'X-API-Key', required: true }),
    (0, common_1.UseGuards)(automation_auth_guard_1.AutomationAuthGuard),
    (0, common_1.Controller)('jobs/media'),
    __metadata("design:paramtypes", [media_service_1.MediaService])
], MediaController);
//# sourceMappingURL=media.controller.js.map
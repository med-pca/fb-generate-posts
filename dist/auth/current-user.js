"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActingUser = void 0;
const common_1 = require("@nestjs/common");
exports.ActingUser = (0, common_1.createParamDecorator)((_data, context) => context.switchToHttp().getRequest().user ?? null);
//# sourceMappingURL=current-user.js.map
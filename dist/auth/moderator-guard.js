"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmin = exports.MODERATOR_LOCKED = void 0;
exports.assertMayManage = assertMayManage;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
exports.MODERATOR_LOCKED = 'Profil modérateur : seul un administrateur de la plateforme peut le modifier (rubrique Modérateurs)';
function assertMayManage(profile, acting) {
    if (profile.isModerator && acting && acting.role !== client_1.Role.ADMIN) {
        throw new common_1.ForbiddenException(exports.MODERATOR_LOCKED);
    }
}
const isAdmin = (acting) => !acting || acting.role === client_1.Role.ADMIN;
exports.isAdmin = isAdmin;
//# sourceMappingURL=moderator-guard.js.map
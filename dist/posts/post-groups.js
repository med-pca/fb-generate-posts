"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postGroupIds = postGroupIds;
const common_1 = require("@nestjs/common");
const scope_1 = require("../auth/scope");
async function postGroupIds(prisma, groupIds, acting) {
    const unique = [...new Set(groupIds)];
    if (!unique.length) {
        throw new common_1.BadRequestException('Choisissez au moins un groupe');
    }
    const groups = await prisma.group.findMany({
        where: {
            id: { in: unique },
            status: 'ACTIVE',
            ...(0, scope_1.groupWhere)((0, scope_1.scopeOf)(acting)),
        },
        select: { categoryId: true },
    });
    if (groups.length !== unique.length) {
        throw new common_1.BadRequestException('Groupe introuvable ou inactif');
    }
    if (new Set(groups.map((group) => group.categoryId)).size > 1) {
        throw new common_1.BadRequestException('Les groupes d’un post doivent appartenir à la même catégorie');
    }
    return unique;
}
//# sourceMappingURL=post-groups.js.map
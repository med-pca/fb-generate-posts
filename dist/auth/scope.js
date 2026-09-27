"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logWhere = exports.jobWhere = exports.articleWhere = exports.postWhere = exports.siteManageWhere = exports.groupManageWhere = exports.siteWhere = exports.groupWhere = exports.ingestWhere = exports.profileWhere = exports.seesEverything = void 0;
exports.scopeOf = scopeOf;
exports.ownedWhere = ownedWhere;
exports.withScope = withScope;
const client_1 = require("@prisma/client");
function scopeOf(user) {
    if (!user || user.role === client_1.Role.ADMIN)
        return null;
    return { ownerId: user.id };
}
const seesEverything = (scope) => scope === null;
exports.seesEverything = seesEverything;
function ownedWhere(scope) {
    return scope ? { ownerId: scope.ownerId } : {};
}
const profileWhere = (scope) => ownedWhere(scope);
exports.profileWhere = profileWhere;
const ingestWhere = (scope) => ownedWhere(scope);
exports.ingestWhere = ingestWhere;
const groupWhere = (scope) => scope
    ? {
        OR: [
            { ownerId: scope.ownerId },
            { access: { some: { userId: scope.ownerId } } },
        ],
    }
    : {};
exports.groupWhere = groupWhere;
const siteWhere = (scope) => scope
    ? {
        OR: [
            { ownerId: scope.ownerId },
            { access: { some: { userId: scope.ownerId } } },
        ],
    }
    : {};
exports.siteWhere = siteWhere;
const groupManageWhere = (scope) => ownedWhere(scope);
exports.groupManageWhere = groupManageWhere;
const siteManageWhere = (scope) => ownedWhere(scope);
exports.siteManageWhere = siteManageWhere;
const postWhere = (scope) => scope ? { profile: { ownerId: scope.ownerId } } : {};
exports.postWhere = postWhere;
const articleWhere = (scope) => scope ? { source: { ownerId: scope.ownerId } } : {};
exports.articleWhere = articleWhere;
const jobWhere = (scope) => scope ? { profile: { ownerId: scope.ownerId } } : {};
exports.jobWhere = jobWhere;
const logWhere = (scope) => scope
    ? {
        OR: [
            { profile: { ownerId: scope.ownerId } },
            { group: { ownerId: scope.ownerId } },
            { group: { access: { some: { userId: scope.ownerId } } } },
        ],
    }
    : {};
exports.logWhere = logWhere;
function withScope(scope, filters) {
    return (0, exports.seesEverything)(scope)
        ? filters
        : { AND: [filters, ownedWhere(scope)] };
}
//# sourceMappingURL=scope.js.map
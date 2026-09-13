"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginated = paginated;
function paginated(data, total, page, limit) {
    return { data, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}
//# sourceMappingURL=paginated.js.map
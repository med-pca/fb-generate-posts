"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.perfContext = void 0;
exports.countSql = countSql;
const node_async_hooks_1 = require("node:async_hooks");
exports.perfContext = new node_async_hooks_1.AsyncLocalStorage();
function countSql(ms) {
    const ctx = exports.perfContext.getStore();
    if (ctx) {
        ctx.sql += 1;
        ctx.sqlMs += ms;
    }
}
//# sourceMappingURL=perf-context.js.map
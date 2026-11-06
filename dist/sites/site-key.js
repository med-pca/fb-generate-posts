"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSiteKey = generateSiteKey;
const node_crypto_1 = require("node:crypto");
function generateSiteKey() {
    return `dfb_site_${(0, node_crypto_1.randomBytes)(32).toString('base64url')}`;
}
//# sourceMappingURL=site-key.js.map
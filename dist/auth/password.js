"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.newAutomationKey = newAutomationKey;
const node_crypto_1 = require("node:crypto");
const KEY_LENGTH = 64;
function hashPassword(password) {
    const salt = (0, node_crypto_1.randomBytes)(16).toString('hex');
    return `${salt}:${(0, node_crypto_1.scryptSync)(password, salt, KEY_LENGTH).toString('hex')}`;
}
function verifyPassword(password, stored) {
    const [salt, digest] = stored.split(':');
    if (!salt || !digest)
        return false;
    const expected = Buffer.from(digest, 'hex');
    const actual = (0, node_crypto_1.scryptSync)(password, salt, KEY_LENGTH);
    return expected.length === actual.length && (0, node_crypto_1.timingSafeEqual)(expected, actual);
}
function newAutomationKey() {
    return (0, node_crypto_1.randomBytes)(32).toString('hex');
}
//# sourceMappingURL=password.js.map
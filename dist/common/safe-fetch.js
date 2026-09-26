"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPrivateIp = isPrivateIp;
exports.assertSafeRemoteUrl = assertSafeRemoteUrl;
const common_1 = require("@nestjs/common");
const promises_1 = require("node:dns/promises");
const node_net_1 = require("node:net");
function isPrivateIp(address) {
    if (!(0, node_net_1.isIP)(address))
        return true;
    const normalized = address.toLowerCase();
    return (normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe80:') ||
        normalized.startsWith('127.') ||
        normalized.startsWith('10.') ||
        normalized.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) ||
        /^169\.254\./.test(normalized));
}
async function assertSafeRemoteUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
        throw new common_1.BadRequestException('Seules les sources HTTPS sont acceptées');
    }
    let addresses;
    try {
        addresses = await (0, promises_1.lookup)(url.hostname, { all: true });
    }
    catch {
        throw new common_1.BadGatewayException('Le nom de domaine de la source est temporairement inaccessible');
    }
    if (!addresses.length ||
        addresses.some(({ address }) => isPrivateIp(address))) {
        throw new common_1.BadRequestException('Les adresses locales ou privées sont interdites');
    }
    return url;
}
//# sourceMappingURL=safe-fetch.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWeb = registerWeb;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const session_service_1 = require("../auth/session.service");
const cookies_1 = require("../auth/cookies");
const routes_1 = require("./routes");
const PUBLIC = (0, node_path_1.join)(process.cwd(), 'public');
const APP_FILES = {
    '/assets/app.js': { file: 'admin/app.js', type: 'text/javascript; charset=utf-8' },
    '/assets/styles.css': { file: 'admin/styles.css', type: 'text/css; charset=utf-8' },
};
const LOGIN_FILES = {
    '/login.js': { file: 'login/login.js', type: 'text/javascript; charset=utf-8' },
    '/login.css': { file: 'login/login.css', type: 'text/css; charset=utf-8' },
};
function registerWeb(app) {
    const fastify = app.getHttpAdapter().getInstance();
    const sessions = app.get(session_service_1.SessionService);
    const loggedIn = async (request) => {
        const token = (0, cookies_1.sessionTokenFrom)(request.headers);
        return token ? Boolean(await sessions.validate(token)) : false;
    };
    const send = async (reply, file, type, cache = 'no-store') => {
        const body = await (0, promises_1.readFile)((0, node_path_1.join)(PUBLIC, file));
        return reply.header('content-type', type).header('cache-control', cache).send(body);
    };
    fastify.addHook('onSend', async (request, reply, payload) => {
        for (const [name, value] of Object.entries(routes_1.SECURITY_HEADERS))
            reply.header(name, value);
        if (!request.url.startsWith('/api/docs'))
            reply.header('content-security-policy', routes_1.PAGE_CSP);
        if ((0, cookies_1.isSecure)(request.headers))
            reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
        return payload;
    });
    fastify.addHook('onRequest', async (request, reply) => {
        if (request.url.startsWith('/api/docs') && !(await loggedIn(request))) {
            return reply.redirect(`/login?next=${encodeURIComponent('/api/docs')}`, 302);
        }
    });
    fastify.get('/login', async (request, reply) => {
        const next = (0, routes_1.safeNext)(request.query?.next);
        if (await loggedIn(request))
            return reply.redirect(next, 302);
        return send(reply, 'login/index.html', 'text/html; charset=utf-8');
    });
    for (const [path, asset] of Object.entries(LOGIN_FILES)) {
        fastify.get(path, (_request, reply) => send(reply, asset.file, asset.type, 'public, max-age=300'));
    }
    for (const [path, asset] of Object.entries(APP_FILES)) {
        fastify.get(path, async (request, reply) => {
            if (!(await loggedIn(request)))
                return reply.code(401).header('cache-control', 'no-store').send('Session requise');
            return send(reply, asset.file, asset.type, 'private, no-cache');
        });
    }
    for (const path of Object.keys(routes_1.APP_ROUTES)) {
        fastify.get(path, async (request, reply) => {
            if (!(await loggedIn(request))) {
                const back = (0, routes_1.appPath)(request.url) === '/' ? '' : `?next=${encodeURIComponent(request.url)}`;
                return reply.redirect(`/login${back}`, 302);
            }
            return send(reply, 'admin/index.html', 'text/html; charset=utf-8');
        });
    }
    const legacy = (request, reply) => reply.redirect((0, routes_1.legacyTarget)(request.url) ?? '/', 301);
    fastify.get('/admin', legacy);
    fastify.get('/admin/*', legacy);
}
//# sourceMappingURL=web.js.map
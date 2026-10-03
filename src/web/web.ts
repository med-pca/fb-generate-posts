import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SessionService } from '../auth/session.service';
import { isSecure, sessionTokenFrom } from '../auth/cookies';
import { APP_ROUTES, PAGE_CSP, SECURITY_HEADERS, appPath, legacyTarget, safeNext } from './routes';

const PUBLIC = join(process.cwd(), 'public');
/** L'interface : servie seulement à une session valide. */
const APP_FILES: Record<string, { file: string; type: string }> = {
  '/assets/app.js': { file: 'admin/app.js', type: 'text/javascript; charset=utf-8' },
  '/assets/styles.css': { file: 'admin/styles.css', type: 'text/css; charset=utf-8' },
};
/** La page de connexion : publique, et rien d'autre. */
const LOGIN_FILES: Record<string, { file: string; type: string }> = {
  '/login.js': { file: 'login/login.js', type: 'text/javascript; charset=utf-8' },
  '/login.css': { file: 'login/login.css', type: 'text/css; charset=utf-8' },
};

/** Les pages de la plateforme : la connexion à part, une adresse par
 * rubrique, et l'interface uniquement derrière une session. */
export function registerWeb(app: NestFastifyApplication) {
  const fastify = app.getHttpAdapter().getInstance();
  const sessions = app.get(SessionService);
  const loggedIn = async (request: FastifyRequest) => {
    const token = sessionTokenFrom(request.headers);
    return token ? Boolean(await sessions.validate(token)) : false;
  };
  const send = async (reply: FastifyReply, file: string, type: string, cache = 'no-store') => {
    const body = await readFile(join(PUBLIC, file));
    return reply.header('content-type', type).header('cache-control', cache).send(body);
  };

  // En-têtes de sécurité sur toutes les réponses ; HSTS en HTTPS.
  fastify.addHook('onSend', async (request, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
    if (!request.url.startsWith('/api/docs')) reply.header('content-security-policy', PAGE_CSP);
    if (isSecure(request.headers)) reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    return payload;
  });

  // La documentation de l'API décrit tout : réservée aux comptes connectés.
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/docs') && !(await loggedIn(request))) {
      return reply.redirect(`/login?next=${encodeURIComponent('/api/docs')}`, 302);
    }
  });

  fastify.get('/login', async (request, reply) => {
    const next = safeNext((request.query as Record<string, unknown>)?.next);
    if (await loggedIn(request)) return reply.redirect(next, 302);
    return send(reply, 'login/index.html', 'text/html; charset=utf-8');
  });
  for (const [path, asset] of Object.entries(LOGIN_FILES)) {
    fastify.get(path, (_request, reply) => send(reply, asset.file, asset.type, 'public, max-age=300'));
  }
  for (const [path, asset] of Object.entries(APP_FILES)) {
    fastify.get(path, async (request, reply) => {
      if (!(await loggedIn(request))) return reply.code(401).header('cache-control', 'no-store').send('Session requise');
      return send(reply, asset.file, asset.type, 'private, no-cache');
    });
  }
  // Une adresse par rubrique ; sans session, la page de connexion, qui
  // ramène ensuite exactement ici.
  for (const path of Object.keys(APP_ROUTES)) {
    fastify.get(path, async (request, reply) => {
      if (!(await loggedIn(request))) {
        const back = appPath(request.url) === '/' ? '' : `?next=${encodeURIComponent(request.url)}`;
        return reply.redirect(`/login${back}`, 302);
      }
      return send(reply, 'admin/index.html', 'text/html; charset=utf-8');
    });
  }
  // Les anciennes adresses en /admin : redirigées, plus jamais servies.
  const legacy = (request: FastifyRequest, reply: FastifyReply) =>
    reply.redirect(legacyTarget(request.url) ?? '/', 301);
  fastify.get('/admin', legacy);
  fastify.get('/admin/*', legacy);
}

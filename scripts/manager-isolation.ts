/* Test d'isolement de bout en bout : deux gestionnaires et un admin, chacun
 * ses données ; chaque écran doit ne montrer à un gestionnaire QUE les
 * siennes. Lancé contre une base jetable :
 *   DATABASE_URL=… npx ts-node --transpile-only scripts/manager-isolation.ts */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';

const prisma = new PrismaClient();
let base = '';
async function seed(owner: { id: string } | null, tag: string) {
  const ownerId = owner?.id ?? null;
  const cat = await prisma.category.create({ data: { name: `Cat-${tag}` } });
  const site = await prisma.contentSource.create({ data: { name: `Site-${tag}`, originUrl: `https://${tag}.test`, ownerId, categoryId: cat.id } as any });
  const group = await prisma.group.create({ data: { name: `Groupe-${tag}`, url: `https://facebook.com/groups/${tag}`, ownerId, categoryId: cat.id } as any });
  const profile = await prisma.profile.create({ data: { name: `Profil-${tag}`, externalId: `ext-${tag}`, ownerId } as any });
  await prisma.profileGroup.create({ data: { profileId: profile.id, groupId: group.id, joinStatus: 'JOINED' } });
  const article = await prisma.article.create({ data: { title: `Article-${tag}`, slug: tag, captions: [], articleUrl: `https://${tag}.test/a`, sourceId: site.id, externalId: tag, jsonUrl: `https://${tag}.test/j`, rawData: {} } as any });
  await prisma.post.create({ data: { title: `Post-${tag}`, description: tag, delay: 0, articleId: article.id, ownerId, targets: { create: [{ groupId: group.id }] } } as any });
  await prisma.campaign.create({ data: { name: `Campagne-${tag}`, siteId: site.id, ownerId, target: 10 } as any });
  return { site, group, profile, article };
}
async function login(username: string) {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'PostFlow' }, body: JSON.stringify({ username, password: 'motdepasse123' }) });
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error(`connexion refusée pour ${username} (${r.status})`);
  return async (path: string, init: RequestInit = {}) => {
    // Comme l'interface : l'en-tête JSON seulement avec un corps.
    const res = await fetch(`${base}/api${path}`, { ...init, headers: { cookie, 'x-requested-with': 'PostFlow', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) } });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, text };
  };
}

(async () => {
  const hash = hashPassword('motdepasse123');
  const admin = await prisma.user.create({ data: { username: 'admin', passwordHash: hash, role: 'ADMIN', automationKey: 'k-admin' } as any });
  const a = await prisma.user.create({ data: { username: 'karim', passwordHash: hash, role: 'MANAGER', automationKey: 'k-a' } as any });
  const b = await prisma.user.create({ data: { username: 'sara', passwordHash: hash, role: 'MANAGER', automationKey: 'k-b' } as any });
  const A = await seed(a, 'karim');
  const B = await seed(b, 'sara');
  await seed(admin, 'admin');

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  base = base.replace('[::1]', '127.0.0.1');

  let ko = 0;
  const check = (label: string, ok: boolean, got?: unknown) => {
    console.log(`${ok ? '  ok  ' : '  KO  '}${label}${ok ? '' : ` → ${JSON.stringify(got).slice(0, 300)}`}`);
    if (!ok) ko++;
  };
  const karim = await login('karim');
  const boss = await login('admin');
  const names = (body: any) => JSON.stringify(body);
  const only = async (label: string, path: string) => {
    const r = await karim(path);
    const t = names(r.body);
    check(`${label} : les siens, rien de sara ni de l’admin`, r.status === 200 && t.includes('karim') && !t.includes('sara') && !t.includes('-admin'), { status: r.status, t: t.slice(0, 200) });
  };
  console.log('— Ce que voit karim (gestionnaire) —');
  await only('Profils', '/profiles?page=1&limit=50');
  await only('Groupes', '/groups?page=1&limit=50');
  await only('Sites', '/sites');
  await only('Articles', '/articles?page=1&limit=50');
  await only('Posts', '/posts?page=1&limit=50');
  await only('Campagnes', '/campaigns');
  await only('Pilotage', '/runners');
  await only('Règles & priorités', '/posts/priorities');
  const an = await karim('/analytics');
  check('Analyse : accessible', an.status === 200, an.status);

  console.log('— Ce que karim ne peut pas toucher —');
  const hit = async (label: string, path: string, method: string, body?: unknown) => {
    const r = await karim(path, { method, body: body ? JSON.stringify(body) : undefined });
    check(`${label} → refusé`, [403, 404, 400].includes(r.status), { status: r.status, t: r.text.slice(0, 150) });
  };
  await hit('Modifier le groupe de sara', `/groups/${B.group.id}`, 'PATCH', { name: 'piraté' });
  await hit('Supprimer le profil de sara', `/profiles/${B.profile.id}`, 'DELETE');
  await hit('Lire l’article de sara', `/articles/${B.article.id}`, 'GET');
  await hit('Campagne sur le site de sara', '/campaigns', 'POST', { name: 'x', siteId: B.site.id, period: 'day', target: 5 });
  await hit('Changer les réglages communs', '/settings', 'PATCH', { dailyTarget: 1 });
  await hit('Voir les comptes', '/users', 'GET');
  await hit('Rétablir le profil suspendu de sara', `/profiles/${B.profile.id}/suspension/clear`, 'POST');

  console.log('— Ce que karim peut faire —');
  const c = await karim('/campaigns', { method: 'POST', body: JSON.stringify({ name: 'Ma campagne', siteId: A.site.id, period: 'week', target: 50 }) });
  check('Créer une campagne sur SON site', c.status === 201, c.text.slice(0, 200));
  const g = await karim(`/groups/${A.group.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Groupe-karim-2' }) });
  check('Modifier SON groupe', g.status === 200, g.text.slice(0, 200));
  const m = await karim('/bulk/memberships', { method: 'POST', body: JSON.stringify({ profileIds: [A.profile.id], groupIds: [A.group.id], preApproved: true }) });
  check('Marquer SON profil pré-approuvé', m.status === 200 && m.body.updated === 1, m.text.slice(0, 200));
  const cat = await karim('/categories', { method: 'POST', body: JSON.stringify({ name: 'Cat-nouvelle-karim' }) });
  check('Créer une catégorie', [200, 201].includes(cat.status), cat.text.slice(0, 200));

  await prisma.profile.update({ where: { id: A.profile.id }, data: { facebookSuspension: 'checkpoint' } });
  const cl = await karim(`/profiles/${A.profile.id}/suspension/clear`, { method: 'POST' });
  check('Rétablir SON profil suspendu', [200, 201].includes(cl.status), cl.text.slice(0, 200));

  console.log('— L’admin voit tout —');
  const all = names((await boss('/profiles?page=1&limit=50')).body);
  check('Profils de tous', all.includes('karim') && all.includes('sara') && all.includes('-admin'));

  await app.close();
  await prisma.$disconnect();
  console.log(ko ? `\n${ko} problème(s)` : '\nIsolement correct.');
  process.exit(ko ? 1 : 0);
})().catch(async (e) => {
  console.error('ERR', e.stack?.slice(0, 800));
  process.exit(2);
});

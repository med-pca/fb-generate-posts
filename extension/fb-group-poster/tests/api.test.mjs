/* The job API client against a real HTTP server, like tests/test_job_api.py. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { JobApi, ClaimLostError, ApiError } from '../src/background/api.js';

async function withServer(routes, run) {
  const seen = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    seen.push({ method: req.method, url: req.url, body, key: req.headers['x-api-key'] });
    const route = routes[`${req.method} ${req.url.split('?')[0]}`] || routes[`${req.method} ${req.url}`];
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'no such route' }));
      return;
    }
    const [status, payload] = route(req);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(payload === undefined ? '' : JSON.stringify(payload));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    await run(new JobApi(base, 'secret'), seen);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('un lot reserve est traduit en job', async () => {
  await withServer({
    'POST /api/jobs/claim/profile/p1': () => [200, {
      jobId: 'j1',
      claimExpiresAt: '2026-09-27T12:00:00Z',
      group: { externalId: '422151397276363', name: 'Groupe', url: 'https://fb.com/groups/slug' },
      posts: [{
        id: 'post1', title: 'T', description: 'Texte &amp; suite', image: 'http://img/1.jpg', delay: 45,
        comment: { text: 'du texte', willReceiveLink: true },
      }],
    }],
  }, async (api, seen) => {
    const job = await api.claim('p1');
    assert.equal(job.kind, 'job');
    assert.equal(job.jobId, 'j1');
    assert.equal(job.groupExternalId, '422151397276363');
    assert.equal(job.posts[0].delayMinutes, 45);
    assert.equal(job.posts[0].commentText, 'du texte');
    assert.equal(job.posts[0].willReceiveLink, true);
    assert.equal(job.claimExpiresAt, Date.parse('2026-09-27T12:00:00Z'));
    assert.equal(seen[0].key, 'secret');
  });
});

test("un profil occupe n'est pas un pool vide", async () => {
  await withServer({
    'POST /api/jobs/claim/profile/p1': () => [200, { activeJobId: 'j9', message: 'busy' }],
  }, async (api) => {
    const job = await api.claim('p1');
    assert.equal(job.kind, 'busy');
    assert.equal(job.jobId, 'j9');
  });
});

test('un pool vide est signale comme tel', async () => {
  await withServer({
    'POST /api/jobs/claim/profile/p1': () => [200, { jobId: null, posts: [] }],
  }, async (api) => {
    assert.equal((await api.claim('p1')).kind, 'empty');
  });
});

test('le groupe impose voyage en parametre', async () => {
  await withServer({
    'POST /api/jobs/claim/profile/p1': () => [200, { posts: [] }],
  }, async (api, seen) => {
    await api.claim('p1', '123');
    assert.match(seen[0].url, /\?groupExternalId=123$/);
  });
});

test('un 409 devient une reservation perdue, jamais une republication', async () => {
  await withServer({
    'POST /api/jobs/j1/posts/post1/consumed': () => [409, { message: 'claim taken over' }],
  }, async (api) => {
    await assert.rejects(() => api.markConsumed('j1', 'post1'), ClaimLostError);
  });
});

test('une cle refusee est dite clairement', async () => {
  await withServer({
    'POST /api/jobs/j1/complete': () => [401, { message: 'nope' }],
  }, async (api) => {
    await assert.rejects(() => api.complete('j1'), (err) => err instanceof ApiError && /cle/.test(err.message));
  });
});

test('un echec porte toujours une raison non vide', async () => {
  await withServer({
    'POST /api/jobs/j1/posts/post1/failed': () => [200, {}],
  }, async (api, seen) => {
    await api.markFailed('j1', 'post1', '');
    assert.equal(seen[0].body.error, 'unknown error');
  });
});

test("l'URL du post manquante dans la file est reprise du detail du job", async () => {
  await withServer({
    'GET /api/jobs/link-updates': () => [200, [{
      jobId: 'j1',
      updates: [
        { postId: 'p1', commentExternalId: 'c1', url: 'https://site/a' },
        { postId: 'p2', commentExternalId: 'c2', url: 'https://site/b' },
      ],
    }]],
    'GET /api/jobs/j1/link-updates': () => [200, {
      data: [
        // Deliberately in the other order: the join is on ids, not on position.
        { postId: 'p2', commentExternalId: 'c2', url: 'https://site/b', externalPostUrl: 'https://facebook.com/groups/1/posts/22/' },
        { postId: 'p1', commentExternalId: 'c1', url: 'https://site/a', externalPostUrl: 'https://facebook.com/groups/1/posts/11/' },
      ],
    }],
  }, async (api) => {
    const updates = await api.pendingLinkUpdates('p1');
    assert.equal(updates.length, 2);
    assert.equal(updates[0].externalPostUrl, 'https://facebook.com/groups/1/posts/11/');
    assert.equal(updates[1].externalPostUrl, 'https://facebook.com/groups/1/posts/22/');
  });
});

test('un commentaire en attente sans URL de post est une erreur, pas un lien pose au hasard', async () => {
  await withServer({
    'GET /api/jobs/link-updates': () => [200, [{ jobId: 'j1', updates: [{ postId: 'p1', commentExternalId: 'c1', url: 'https://site/a' }] }]],
    'GET /api/jobs/j1/link-updates': () => [200, { data: [] }],
  }, async (api) => {
    await assert.rejects(() => api.pendingLinkUpdates('p1'), ApiError);
  });
});

test("l'absence de route profils ne casse rien", async () => {
  await withServer({}, async (api) => {
    assert.equal(await api.listProfiles(), null);
  });
});

test('les profils actifs sont lus avec leur externalId', async () => {
  await withServer({
    'GET /api/jobs/profiles': () => [200, { data: [{ externalId: 'a', name: 'Un' }, { name: 'sans id' }] }],
  }, async (api) => {
    const profiles = await api.listProfiles();
    assert.deepEqual(profiles, [{ externalId: 'a', name: 'Un', id: '' }]);
  });
});

test('une ligne de journal refusee ne fait pas tomber le run', async () => {
  await withServer({ 'POST /api/logs': () => [500, { message: 'boom' }] }, async (api) => {
    await api.log('WORKER_POST_PUBLISHED', 'ok'); // must not throw
  });
});

test("un pool vide garde la raison donnee par l'API, pour le journal", async () => {
  await withServer({
    'POST /api/jobs/claim/profile/p1': () => [200, {
      job: null,
      posts: [],
      reason: 'not_joined',
      message: "Ce profil n'a rejoint aucun de ses 3 groupe(s) (2 demande(s) en attente).",
      diagnosis: { linkedGroups: 3, joinedGroups: 0, pendingRequests: 2 },
    }],
  }, async (api) => {
    const job = await api.claim('p1');
    assert.equal(job.kind, 'empty');
    assert.equal(job.reason, 'not_joined');
    assert.match(job.message, /rejoint aucun de ses 3 groupe/);
    assert.deepEqual(job.diagnosis, { linkedGroups: 3, joinedGroups: 0, pendingRequests: 2 });
  });
});

test("liberer un lot oublie appelle la route de liberation de l'API", async () => {
  await withServer({
    'POST /api/jobs/j9/release': () => [200, { jobId: 'j9', released: 2, inProgress: 0, alreadyClosed: false }],
  }, async (api) => {
    const r = await api.release('j9');
    assert.equal(r.released, 2);
  });
});

test('un échec avant « Publier » demande la remise en file ; sinon non', async () => {
  await withServer({ 'POST /api/jobs/j1/posts/p1/failed': () => [201, {}] }, async (api, seen) => {
    await api.markFailed('j1', 'p1', 'composeur absent', { requeue: true });
    await api.markFailed('j1', 'p1', 'peut-être publié');
    assert.deepEqual(seen[0].body, { error: 'composeur absent', requeue: true });
    assert.deepEqual(seen[1].body, { error: 'peut-être publié' });
  });
});

test('un post « engagement » arrive marqué sans commentaire', async () => {
  await withServer({
    'POST /api/jobs/claim/profile/p1': () => [201, { jobId: 'j1', group: { externalId: '123', id: 'g' }, posts: [
      { id: 'a', title: 'A', description: 'Quel est votre souvenir ?', image: 'https://post.test/media/g/abc.png', delay: 10, noComment: true, comment: { text: 'x', willReceiveLink: false } },
      { id: 'b', title: 'B', description: 'Recette', image: null, delay: 10, comment: { text: 'y', willReceiveLink: true } },
    ] }],
  }, async (api) => {
    const job = await api.claim('p1');
    assert.equal(job.posts[0].noComment, true);
    assert.equal(job.posts[1].noComment, false);
  });
});

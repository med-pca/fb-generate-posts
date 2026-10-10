/* Le premier commentaire a disparu (souris bougée, saisie perdue) : la pose du
 * lien le retrouve ou le repose, 3 tentatives au plus, puis passe à la suite. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { stubChrome } from './helpers.mjs';

const { chrome } = stubChrome();
let script = [];
const asked = [];
chrome.tabs.sendMessage = async (_tab, msg) => {
  if (msg.name === 'ping') return { ok: true };
  asked.push(msg.name);
  const next = script.find((s) => s.name === msg.name && !s.used);
  if (!next) return { ok: false, reason: 'not scripted' };
  next.used = true;
  return next.answer;
};
const { ensureComment } = await import('../src/background/links.js');
const config = { stepTimeoutSeconds: 1, firstCommentText: '.', navigationTimeoutSeconds: 1, pageSettleSeconds: 0 };
const update = { jobId: 'j1', postId: 'p1', commentExternalId: 'c-old' };

function api() {
  const calls = [];
  return { calls, markCommented: async (...args) => { calls.push(args); return { url: 'https://site.test/a' }; } };
}

test('un « . » de notre compte existe encore : il est repris, rien n’est réécrit', async () => {
  script = [{ name: 'readCommentId', answer: { ok: true, id: 'c-found' } }];
  asked.length = 0;
  const a = api();
  const r = await ensureComment(1, a, config, { ...update }, 'https://www.facebook.com/groups/1/posts/2/');
  assert.deepEqual(r, { ok: true, id: 'c-found' });
  assert.ok(!asked.includes('writeComment'));
  assert.deepEqual(a.calls[0], ['j1', 'p1', 'c-found', { replace: true }]);
});

test('aucun « . » : il en pose un nouveau, l’enregistre (remplace l’ancien) et continue', async () => {
  script = [
    { name: 'readCommentId', answer: { ok: false, reason: 'the comment is not on the page' } },
    { name: 'writeComment', answer: { ok: true } },
    { name: 'readCommentId', answer: { ok: true, id: 'c-new' } },
  ];
  asked.length = 0;
  const a = api();
  const r = await ensureComment(1, a, config, { ...update }, 'https://www.facebook.com/groups/1/posts/2/');
  assert.deepEqual(r, { ok: true, id: 'c-new' });
  assert.deepEqual(a.calls[0], ['j1', 'p1', 'c-new', { replace: true }]);
});

test('3 tentatives au plus, puis il abandonne cette étape au lieu de boucler', async () => {
  script = [];
  asked.length = 0;
  const r = await ensureComment(1, api(), config, { ...update }, 'https://www.facebook.com/groups/1/posts/2/');
  assert.equal(r.ok, false);
  assert.match(r.reason, /3 tentatives/);
  assert.equal(asked.filter((n) => n === 'writeComment').length, 3);
});

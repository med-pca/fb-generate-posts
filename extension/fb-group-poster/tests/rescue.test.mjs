/* 🛟 Le profil sauveteur : il pose le lien sous le post d'un AUTRE profil,
 * dans son propre commentaire, ou constate qu'il y est déjà. */
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
const { rescueLinks } = await import('../src/background/rescue.js');
const config = { profileExternalId: 'nst-2', stepTimeoutSeconds: 1, firstCommentText: '.', navigationTimeoutSeconds: 1, pageSettleSeconds: 0, rescueLinks: true };
const task = { targetId: 't1', postId: 'p1', postUrl: 'https://www.facebook.com/groups/1/posts/2/', url: 'https://site.test/article', title: 'Recette', group: 'Cuisine' };

function api(due = [task]) {
  const reports = [];
  return { reports, rescuesDue: async () => due, reportRescue: async (...args) => { reports.push(args); return {}; } };
}

test('le lien est déjà sous le post : « already », rien n’est écrit', async () => {
  script = [{ name: 'pageHasLink', answer: { ok: true } }];
  asked.length = 0;
  const a = api();
  const r = await rescueLinks(config, a);
  assert.deepEqual(r, { checked: 1, rescued: 1 });
  assert.equal(a.reports[0][2], 'already');
  assert.ok(!asked.includes('writeComment'));
});

test('lien absent : son « . », remplacé par le lien, vérifié → « done » avec SON commentaire', async () => {
  script = [
    { name: 'pageHasLink', answer: { ok: false } },
    { name: 'readAuthor', answer: { ok: true, name: 'Rihab' } },
    { name: 'writeComment', answer: { ok: true } },
    { name: 'readCommentId', answer: { ok: true, id: 'c-rescue' } },
    { name: 'editCommentById', answer: { ok: true } },
    { name: 'commentHoldsText', answer: { ok: true } },
  ];
  asked.length = 0;
  const a = api();
  await rescueLinks(config, a);
  const [targetId, who, outcome, extra] = a.reports[0];
  assert.deepEqual([targetId, who, outcome, extra.commentExternalId], ['t1', 'nst-2', 'done', 'c-rescue']);
});

test('son nom illisible : il s’arrête (sinon il confondrait son « . » avec celui de l’auteur)', async () => {
  script = [{ name: 'pageHasLink', answer: { ok: false } }];
  asked.length = 0;
  const a = api();
  await rescueLinks(config, a);
  assert.equal(a.reports[0][2], 'failed');
  assert.match(a.reports[0][3].detail, /nom du compte illisible/);
  assert.ok(!asked.includes('writeComment'));
});

test('option désactivée : il ne demande même pas', async () => {
  let asked2 = false;
  const r = await rescueLinks({ ...config, rescueLinks: false }, { rescuesDue: async () => { asked2 = true; return [task]; } });
  assert.deepEqual(r, { checked: 0, rescued: 0 });
  assert.equal(asked2, false);
});

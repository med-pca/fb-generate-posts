/* Après chaque lot, le profil revient voir ses posts en attente de validation :
 * visible -> il finit le travail ; invisible -> il le note et revient plus tard. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { stubChrome } from './helpers.mjs';

const { chrome } = stubChrome();
let answers = {};
chrome.tabs.sendMessage = async (_tab, msg) => {
  if (msg.name === 'ping') return { ok: true };
  const a = answers[msg.name];
  return typeof a === 'function' ? a(msg.args) : a || { ok: false, reason: 'not scripted' };
};
const { checkApprovals } = await import('../src/background/approvals.js');
const config = { profileExternalId: 'p', stepTimeoutSeconds: 1, addFirstComment: true, firstCommentText: '.', navigationTimeoutSeconds: 1, pageSettleSeconds: 0 };
const item = { targetId: 't1', jobId: 'j1', postId: 'p1', content: 'Une recette facile', willReceiveLink: true, noComment: false, group: { externalId: '123', name: 'Recettes' } };

function api(due) {
  const calls = [];
  return {
    calls,
    approvalsDue: async () => due,
    reportApproval: async (...a) => { calls.push(['report', ...a]); return {}; },
    markCommented: async (...a) => { calls.push(['commented', ...a]); return { url: 'https://site.test/a' }; },
    jobLinkUpdates: async () => [],
    markLinkUpdated: async () => ({}),
    log: async () => ({}),
  };
}

test('toujours invisible : signalé « pending », rien d’autre', async () => {
  answers = { readAuthor: { ok: false }, verifyPublished: { ok: false, reason: 'not in feed' } };
  const a = api([item]);
  const r = await checkApprovals(config, a);
  assert.deepEqual(r, { checked: 1, approved: 0 });
  assert.deepEqual(a.calls, [['report', 't1', 'pending']]);
});

test('visible : validé avec son adresse, puis le « . » est posé et enregistré', async () => {
  answers = {
    readAuthor: { ok: false },
    verifyPublished: { ok: true },
    readPostId: { ok: true, id: '9', url: 'https://www.facebook.com/groups/123/posts/9/' },
    readCommentId: { ok: true, id: 'c1' },
    locateComment: { ok: false, reason: 'skip edit in test' },
  };
  const a = api([item]);
  const r = await checkApprovals(config, a);
  assert.equal(r.approved, 1);
  assert.deepEqual(a.calls[0], ['report', 't1', 'approved', 'https://www.facebook.com/groups/123/posts/9/']);
  assert.ok(a.calls.some((c) => c[0] === 'commented' && c[3] === 'c1'));
});

test('rien à revérifier : aucun onglet ouvert', async () => {
  const r = await checkApprovals(config, api([]));
  assert.deepEqual(r, { checked: 0, approved: 0 });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubChrome } from './helpers.mjs';

stubChrome();
globalThis.chrome.runtime.getManifest = () => ({ version: 'test' });
const { sleepPlan, fallAsleep, WAKE_MARGIN_MS } = await import('../src/background/sleep.js');

const NOW = Date.now();
const config = {
  closeWhenIdle: true, controlEnabled: true, closeIfWaitMinutes: 15,
  nstApiKey: 'nst', profileExternalId: 'prof-1', apiBaseUrl: 'https://x/api', apiKey: 'k',
};
const state = (over = {}) => ({ running: true, once: false, inFlight: null, phase: 'claim', nextDueAt: NOW + 40 * 60_000, ...over });

test('une longue attente entre deux lots : dormir, réveil 3 min avant', () => {
  assert.deepEqual(sleepPlan(config, state(), NOW), { wakeAt: NOW + 40 * 60_000 - WAKE_MARGIN_MS });
});

test('pas de veille quand ce n’est pas le moment', () => {
  assert.equal(sleepPlan({ ...config, closeWhenIdle: false }, state(), NOW), null, 'option décochée');
  assert.equal(sleepPlan({ ...config, controlEnabled: false }, state(), NOW), null, 'sans pilotage, personne ne rouvre');
  assert.equal(sleepPlan({ ...config, nstApiKey: '' }, state(), NOW), null, 'sans clé NSTBrowser');
  assert.equal(sleepPlan(config, state({ nextDueAt: NOW + 10 * 60_000 }), NOW), null, 'attente trop courte');
  assert.equal(sleepPlan(config, state({ phase: 'link' }), NOW), null, 'pendant la pose des liens');
  assert.equal(sleepPlan(config, state({ inFlight: { postId: 'x' } }), NOW), null, 'post en vol');
  assert.equal(sleepPlan(config, state({ once: true }), NOW), null, 'lot unique à la main');
  assert.equal(sleepPlan(config, state({ awakeSince: NOW - 60_000 }), NOW), null, 'tout juste rouvert');
  assert.equal(sleepPlan(config, state({ sleepUntil: NOW + 60_000 }), NOW), null, 'déjà endormi');
  const due = NOW + 40 * 60_000;
  assert.equal(sleepPlan(config, state({ sleepRefusedFor: due, nextDueAt: due }), NOW), null, 'déjà refusé pour cette attente');
  assert.ok(sleepPlan(config, state({ phase: 'wait' }), NOW), 'entre deux posts d’un lot : oui');
});

function harness({ heartbeat, nst }) {
  const calls = [];
  let stored = state();
  const setState = async (patch) => (stored = { ...stored, ...patch });
  globalThis.fetch = async (url, options = {}) => {
    calls.push(`${options.method || 'GET'} ${url} ${options.body || ''}`);
    const body = url.includes('/heartbeat') ? heartbeat(JSON.parse(options.body)) : {};
    return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body };
  };
  const nstFetch = async (url, options) => {
    calls.push(`${options.method} ${url}`);
    return nst();
  };
  return { calls, setState, nstFetch, get stored() { return stored; } };
}

test('serveur d’accord : on lui annonce le réveil, puis NSTBrowser ferme le profil', async () => {
  const h = harness({ heartbeat: (b) => ({ run: true, sleepUntil: b.sleepUntil }), nst: () => ({ ok: true, json: async () => ({}) }) });
  const ok = await fallAsleep(config, state(), h.setState, { wakeAt: NOW + 37 * 60_000 }, h.nstFetch);
  assert.equal(ok, true);
  const beat = h.calls.findIndex((c) => c.includes('/heartbeat') && c.includes('sleepUntil'));
  const close = h.calls.findIndex((c) => c.startsWith('DELETE http://localhost:8848/api/v2/browsers/prof-1'));
  assert.ok(beat >= 0 && close > beat, h.calls.join('\n'));
});

test('sans accusé du serveur, on ne ferme rien', async () => {
  const h = harness({ heartbeat: () => ({ run: true }), nst: () => assert.fail('ne doit pas fermer') });
  assert.equal(await fallAsleep(config, state(), h.setState, { wakeAt: NOW + 37 * 60_000 }, h.nstFetch), false);
  assert.equal(h.stored.sleepUntil, 0);
  assert.equal(h.stored.sleepRefusedFor, state().nextDueAt);
});

test('NSTBrowser refuse : la veille est annulée côté serveur aussi', async () => {
  const beats = [];
  const h = harness({ heartbeat: (b) => (beats.push(b), { run: true, sleepUntil: b.sleepUntil || null }), nst: () => ({ ok: false, status: 500, json: async () => ({ msg: 'boom' }) }) });
  assert.equal(await fallAsleep(config, state(), h.setState, { wakeAt: NOW + 37 * 60_000 }, h.nstFetch), false);
  assert.ok(beats[0].sleepUntil, 'annoncée');
  assert.equal(beats.at(-1).sleepUntil, undefined, 'puis effacée');
});

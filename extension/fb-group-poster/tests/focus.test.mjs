import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stubChrome } from './helpers.mjs';

const { chrome } = stubChrome();
const calls = [];
chrome.windows.update = async (id, props) => calls.push(['window', props]);
chrome.tabs.update = async (id, props) => (calls.push(['tab', props]), { id, windowId: 7 });
let debuggerOk = true;
chrome.debugger = {
  attach: async () => { if (!debuggerOk) throw new Error('Another debugger is already attached'.replace('already attached', 'busy')); calls.push(['attach']); },
  detach: async () => calls.push(['detach']),
  sendCommand: async (_t, method, params) => calls.push([method, params]),
  onEvent: { addListener() {} },
  onDetach: { addListener() {} },
};
const tab = await import('../src/background/tab.js');

test('plusieurs profils sur la machine : le focus est simulé dans la page, la fenêtre n’est pas mise au premier plan', async () => {
  calls.length = 0;
  await tab.focus(1);
  assert.ok(calls.some(([m, p]) => m === 'Emulation.setFocusEmulationEnabled' && p.enabled === true), JSON.stringify(calls));
  assert.ok(!calls.some(([m]) => m === 'window'), 'aucun vol du focus système');
});

test('débogueur indisponible : retour au premier plan, pour que la saisie marche quand même', async () => {
  calls.length = 0;
  debuggerOk = false;
  await tab.focus(2);
  assert.ok(calls.some(([m, p]) => m === 'window' && p.focused === true), JSON.stringify(calls));
  debuggerOk = true;
});

test('le bouton « ouvrir l’onglet » du popup met vraiment la fenêtre devant', async () => {
  calls.length = 0;
  await tab.focus(3, { system: true });
  assert.ok(calls.some(([m]) => m === 'window'));
});
